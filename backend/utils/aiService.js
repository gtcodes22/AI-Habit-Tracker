import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { CATEGORIES, FREQUENCIES } from "../models/Habit.js";

// Lazily create the shared server-wide client — only if a key is
// configured AND the owner has explicitly opted into letting anonymous
// users spend it (GEMINI_SHARED_KEY_ENABLED, default false). This is the
// one choke point every caller that might fall back to the shared key goes
// through (chatCompletionGemini with no personal key, and testConnection's
// gemini branch with no personal key) — so gating it here, once, is enough
// to guarantee no live request against the shared key happens without that
// explicit opt-in, regardless of which endpoint is asking.
//
// This is a UX/frequency safeguard, not a spend guarantee on its own — the
// actual guarantee that the shared key can never cost money is not
// attaching a billing account to it at the provider level. Keep it that
// way; treat this switch as "don't even burn the free quota," not as
// financial protection by itself.
let client = null;
const SHARED_KEY_ENABLED = process.env.GEMINI_SHARED_KEY_ENABLED === "true";
const getClient = () => {
    if (!SHARED_KEY_ENABLED) return null;
    if (client) return client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    client = new GoogleGenAI({ apiKey });
    return client;
};

// "gemini" (default), "ollama", "claude" or "openai". Lets the backend run
// entirely on a local model with no API key, or let a user bring their own
// Claude/ChatGPT key — see docs/ideas.md for the design notes.
export const PROVIDER = process.env.AI_PROVIDER || "gemini";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma2:9b";
// Claude/OpenAI have no server-wide key — they're always per-user (bring
// your own key) — so only the default *model* is server-configurable.
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const DEFAULT_MODEL_FOR = {
    ollama: OLLAMA_MODEL,
    claude: ANTHROPIC_MODEL,
    openai: OPENAI_MODEL,
    gemini: MODEL,
};

// The provider/model actually in use for a call — same resolution
// chatCompletion() does — for the caller to record alongside an AIInsight
// (so results can be compared across providers/users later).
export const resolveProviderAndModel = (override = {}) => {
    const provider = override.provider || PROVIDER;
    const model = override.model || DEFAULT_MODEL_FOR[provider] || MODEL;
    return { provider, model };
};

// The model sometimes wraps JSON output in ```json ... ``` fences even when
// told not to. Strip those before parsing.
export const parseJSON = (text) => {
    const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
    return JSON.parse(cleaned);
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The SDK throws errors whose status can show up in a few different shapes
// depending on version/transport — check all of them.
const getErrorStatus = (err) => {
    if (typeof err?.status === "number") return err.status;
    if (typeof err?.code === "number") return err.code;
    try {
        const parsed = JSON.parse(err?.message || "");
        if (parsed?.error?.code) return Number(parsed.error.code);
    } catch {
        // err.message wasn't JSON — fall through
    }
    return undefined;
};

const isRetryable = (err) =>
    RETRYABLE_STATUS.has(getErrorStatus(err)) ||
    /UNAVAILABLE|high demand|rate limit/i.test(err?.message || "");

// A 429 (rate limit) response tells us exactly how long to wait via a
// RetryInfo detail, e.g. { retryDelay: "13s" }. Honor that instead of our
// own fixed backoff when it's present, capped at 20s so a single request
// never hangs too long.
const getSuggestedDelayMs = (err) => {
    try {
        const parsed = JSON.parse(err?.message || "");
        const retryInfo = parsed?.error?.details?.find((d) =>
            String(d["@type"] || "").includes("RetryInfo")
        );
        const seconds = parseFloat(retryInfo?.retryDelay);
        if (!Number.isNaN(seconds)) return Math.min(seconds * 1000, 20000);
    } catch {
        // err.message wasn't JSON, or had no RetryInfo — fall through
    }
    return undefined;
};

const chatCompletionGemini = async (systemPrompt, userMessage, temperature, model, apiKey) => {
    // A user's own key gets a fresh client; otherwise fall back to the
    // server's shared one (Gemini is the only provider with a server-wide
    // fallback — Claude/OpenAI have none).
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : getClient();
    if (!ai) {
        return "The app's shared Gemini key isn't available right now — add your own free Gemini key in Settings to use AI features.";
    }

    const call = async () => {
        const response = await ai.models.generateContent({
            model,
            contents: userMessage,
            config: {
                systemInstruction: systemPrompt,
                temperature,
            },
        });
        return (response.text || "").trim();
    };

    const backoffMs = [1500]; // one retry — each attempt also counts against
    // the API's own rate limit, so retrying aggressively just digs the hole
    // deeper during a real quota exhaustion.
    for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
        try {
            return await call();
        } catch (err) {
            if (!isRetryable(err) || attempt === backoffMs.length) throw err;
            await sleep(getSuggestedDelayMs(err) ?? backoffMs[attempt]);
        }
    }
};

// Ollama has no SDK — it's a plain local HTTP server. No API key, so
// "unconfigured" isn't a state that applies; a connection failure (the
// Ollama app/service isn't running) is the equivalent degrade-gracefully
// case instead.
const chatCompletionOllama = async (systemPrompt, userMessage, temperature, model, baseUrl = OLLAMA_BASE_URL) => {
    let res;
    try {
        res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
                stream: false,
                options: { temperature },
            }),
        });
    } catch {
        // ECONNREFUSED etc. — the Ollama app/service isn't running.
        return `AI features are currently unavailable — Ollama isn't reachable at ${baseUrl}. Start the Ollama app, or run \`ollama serve\`.`;
    }

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Ollama request failed (${res.status}): ${body || res.statusText}`);
    }

    const data = await res.json();
    return (data?.message?.content || "").trim();
};

const MAX_TOKENS = 1024; // generous for a 120-180 word report; small for a chat answer

// Claude and ChatGPT have no server-wide key — they only ever run with a
// user's own (decrypted) key passed in via `apiKey`. No key means the
// feature is simply unavailable for that call, same degrade-gracefully
// treatment as every other provider.
const chatCompletionClaude = async (systemPrompt, userMessage, temperature, model, apiKey) => {
    if (!apiKey) {
        return "AI features are currently unavailable — add your Anthropic API key in Settings.";
    }
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        temperature,
        messages: [{ role: "user", content: userMessage }],
    });
    return response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
};

const chatCompletionOpenAI = async (systemPrompt, userMessage, temperature, model, apiKey) => {
    if (!apiKey) {
        return "AI features are currently unavailable — add your OpenAI API key in Settings.";
    }
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
        model,
        temperature,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
        ],
    });
    return (response.choices[0]?.message?.content || "").trim();
};

// Sends one request to the configured AI provider with a system prompt +
// user message and returns the trimmed text. Falls back to a placeholder
// when unconfigured/unreachable, rather than throwing. The Gemini path
// retries briefly on transient errors (rate limits, temporary overload).
//
// `override` lets a caller use a specific user's AI preference instead of
// the server-wide default — { provider, model, apiKey, baseUrl }.
// provider/model may be omitted/empty to fall back to the server config for
// that part; apiKey is required for claude/openai (there is no server-wide
// key for those); baseUrl is ollama-only and falls back to OLLAMA_BASE_URL.
export const chatCompletion = (systemPrompt, userMessage, temperature = 0.7, override = {}) => {
    const { provider, model } = resolveProviderAndModel(override);

    switch (provider) {
        case "ollama":
            return chatCompletionOllama(systemPrompt, userMessage, temperature, model, override.baseUrl || OLLAMA_BASE_URL);
        case "claude":
            return chatCompletionClaude(systemPrompt, userMessage, temperature, model, override.apiKey);
        case "openai":
            return chatCompletionOpenAI(systemPrompt, userMessage, temperature, model, override.apiKey);
        default:
            return chatCompletionGemini(systemPrompt, userMessage, temperature, model, override.apiKey);
    }
};

// Makes one cheap, minimal call to confirm a provider/key/model actually
// works, for the Settings UI's "Test connection" button. Never throws —
// always resolves to { ok, message }.
export const testConnection = async (provider, { apiKey, model, baseUrl } = {}) => {
    try {
        if (provider === "ollama") {
            const result = await fetchOllamaModels(baseUrl || OLLAMA_BASE_URL);
            return result.reachable
                ? { ok: true, message: `Connected — ${result.models.length} model(s) found` }
                : { ok: false, message: "Can't reach Ollama. Is it running?" };
        }
        if (provider === "claude") {
            if (!apiKey) return { ok: false, message: "Enter an API key first" };
            const anthropic = new Anthropic({ apiKey });
            await anthropic.messages.create({
                model: model || ANTHROPIC_MODEL,
                max_tokens: 1,
                messages: [{ role: "user", content: "hi" }],
            });
            return { ok: true, message: "Connected" };
        }
        if (provider === "openai") {
            if (!apiKey) return { ok: false, message: "Enter an API key first" };
            const openai = new OpenAI({ apiKey });
            await openai.chat.completions.create({
                model: model || OPENAI_MODEL,
                max_tokens: 1,
                messages: [{ role: "user", content: "hi" }],
            });
            return { ok: true, message: "Connected" };
        }
        if (provider === "gemini") {
            // Same fallback as chatCompletionGemini: a given key gets a
            // fresh client, otherwise test the server's shared key.
            const ai = apiKey ? new GoogleGenAI({ apiKey }) : getClient();
            if (!ai) {
                return {
                    ok: false,
                    message: "No key to test, and the app's shared key isn't available — enter your own Gemini key first",
                };
            }
            await ai.models.generateContent({ model: model || MODEL, contents: "hi" });
            return { ok: true, message: "Connected" };
        }
        return { ok: false, message: `Unknown provider: ${provider}` };
    } catch (err) {
        return { ok: false, message: err.message?.slice(0, 200) || "Connection failed" };
    }
};

// Lists the models currently pulled in the local Ollama installation (for a
// model picker in the UI), and doubles as a connectivity check. Never
// throws — a failure just means Ollama isn't reachable right now.
export const fetchOllamaModels = async (baseUrl = OLLAMA_BASE_URL) => {
    try {
        const res = await fetch(`${baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return { reachable: false, models: [] };
        const data = await res.json();
        const models = Array.isArray(data?.models)
            ? data.models.map((m) => m.name).filter(Boolean)
            : [];
        return { reachable: true, models };
    } catch {
        return { reachable: false, models: [] };
    }
};

export const PROMPTS = {
    weekly: `You are a supportive habit-tracking coach writing a personalized weekly report for a user of a habit-tracking app.

Write a 120-180 word report reviewing the user's last 7 days, based on the habit data they give you. Cover:
- Their wins and what's going well
- Any struggles or habits they're falling behind on
- Any patterns you notice (for example weekday vs. weekend, or a specific category)
- A closing note of genuine encouragement

Use the user's actual habit names from the data. Write in plain prose with natural line breaks — do not use markdown headers, bullet points, or bold text. Keep the tone warm, specific and human, not generic or robotic.`,

    suggestion: `You are a habit-recommendation engine for a habit-tracking app. Based on the user's goals, their most productive time of day, and habits they've struggled with before, suggest exactly 3 new habits tailored to them.

Respond with ONLY valid JSON — a JSON array of exactly 3 objects, and nothing else (no markdown fences, no commentary before or after). Each object must have exactly these fields:
- "name": string, a short habit name (3-6 words)
- "description": string, one sentence describing the habit
- "frequency": string, must be exactly "daily" or "weekly" — no other value
- "category": string, must be exactly one of: ${CATEGORIES.join(", ")} — no other value
- "icon": string, a single emoji that fits the habit
- "reason": string, one sentence explaining why this specific habit fits this specific user, referencing what they told you

Do not invent category or frequency values outside the lists above.`,

    recovery: `You are a compassionate habit-recovery coach. The user just broke a meaningful streak on one of their habits and wants help getting back on track.

Write a response with:
1. A brief, empathetic opening (1-2 sentences) that normalizes breaking a streak without dismissing their effort so far
2. "Day 1:" followed by one concrete, small action for today
3. "Day 2:" followed by one concrete action
4. "Day 3:" followed by one concrete action
5. A short closing line of genuine encouragement

Keep each day's action specific and achievable in under 10 minutes. Reference the habit by name.`,

    chat: `You are a data analyst for a habit-tracking app, answering a user's question about their own habit data.

You will be given the user's habits, their completion data over roughly the last 30 days, and a breakdown of completions by day of the week for each habit. Answer the user's question using ONLY this data — cite actual habit names, specific days, and percentages or counts where relevant. Do not give generic habit advice; ground every claim in the numbers provided. If the data doesn't contain enough information to answer confidently, say so plainly rather than guessing.

Keep your answer conversational and concise (2-4 sentences, unless the question clearly calls for more detail).`,

    morning: `You are a warm, encouraging habit-tracking coach writing a short morning motivation message for a user opening the app.

Write 30-60 words. Mention at least one of the user's actual habits by name and reference a real current streak number from the data provided. Be warm and genuine, not cheesy or over-the-top — use at most one emoji in the whole message, and only if it fits naturally. Do not use markdown formatting.`,
};

// Coerce an AI-suggested habit into something the habits API will accept
// (POST /api/habits validates category/frequency strictly), so a user
// accepting a suggestion can never hit a validation error.
export const sanitizeSuggestion = (s = {}) => ({
    name: typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 80) : "New habit",
    description: typeof s.description === "string" ? s.description.trim().slice(0, 300) : "",
    frequency: FREQUENCIES.includes(s.frequency) ? s.frequency : "daily",
    category: CATEGORIES.includes(s.category) ? s.category : "Other",
    icon: typeof s.icon === "string" && s.icon.trim() ? s.icon.trim() : "🎯",
    reason: typeof s.reason === "string" ? s.reason.trim().slice(0, 300) : "",
});

export const DEFAULT_SUGGESTIONS = [
    {
        name: "Drink more water",
        description: "Aim for 8 glasses of water spread through the day.",
        frequency: "daily",
        category: "Health",
        icon: "💧",
        reason: "Staying hydrated is an easy, low-effort habit that supports energy and focus for everything else you're building.",
    },
    {
        name: "10-minute walk",
        description: "Step outside for a short walk, rain or shine.",
        frequency: "daily",
        category: "Fitness",
        icon: "🚶",
        reason: "A short daily walk is easy to stick with and builds the kind of consistency you can expand on later.",
    },
    {
        name: "Read for 15 minutes",
        description: "Read a few pages of a book before bed.",
        frequency: "daily",
        category: "Learning",
        icon: "📚",
        reason: "A small, fixed reading habit compounds quickly and is easy to protect even on busy days.",
    },
].map(sanitizeSuggestion);

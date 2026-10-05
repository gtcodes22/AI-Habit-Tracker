import { GoogleGenAI } from "@google/genai";
import { CATEGORIES, FREQUENCIES } from "../models/Habit.js";

// Lazily create the client — and only if a key is configured — so the
// server boots fine without GEMINI_API_KEY, and AI features degrade
// gracefully instead of crashing the rest of the app.
let client = null;
const getClient = () => {
    if (client) return client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    client = new GoogleGenAI({ apiKey });
    return client;
};

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

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

// Sends one request to Gemini with a system prompt + user message and
// returns the trimmed text. Falls back to a placeholder when no API key is
// configured, rather than throwing. Retries briefly on transient errors
// (rate limits, temporary overload) since Gemini's own error messages
// describe these as "usually temporary."
export const chatCompletion = async (systemPrompt, userMessage, temperature = 0.7) => {
    const ai = getClient();
    if (!ai) {
        return "AI features are currently unavailable — ask the app owner to set GEMINI_API_KEY.";
    }

    const call = async () => {
        const response = await ai.models.generateContent({
            model: MODEL,
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

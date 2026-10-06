import { checkRateLimit } from "../utils/rateLimiter.js";
import { isDemoUser } from "../utils/demoAIContent.js";

const DEFAULT_LIMIT = Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 5;

const HAS_OWN_KEY_FIELD = {
    gemini: "geminiApiKeyEncrypted",
    claude: "anthropicApiKeyEncrypted",
    openai: "openaiApiKeyEncrypted",
};

// Applied only to the five content-generating AI routes — not
// /ollama-models or /test-connection, which are infrequent, deliberate
// user actions (checking Ollama, verifying a key) that this limiter isn't
// meant to protect against.
//
// Ollama is exempt entirely: it's free and local, so the cost/quota
// concern this exists for doesn't apply, and limiting it would only add
// friction.
//
// The seeded demo account is also exempt: it never reaches a live provider
// at all (see controllers/aiController.js + utils/demoAIContent.js), so
// there's no quota or cost to protect, and a visitor clicking around a demo
// should never see a rate-limit error.
export const aiRateLimit = (req, res, next) => {
    const user = req.user;
    const provider = user.aiProvider || "gemini";

    if (provider === "ollama" || isDemoUser(user)) return next();

    // Scope the limit to what's actually being consumed: a user's own key
    // is their own quota (limit per-user), but Gemini's server-wide
    // fallback key is one shared quota across everyone using it (limit
    // globally) — otherwise N users on the shared key could each get their
    // own "protected" 5/min while collectively blowing through the one
    // real 5/min the key actually has.
    const usesOwnKey = !!user[HAS_OWN_KEY_FIELD[provider]];
    const key = usesOwnKey ? `user:${user._id}:${provider}` : `shared:${provider}`;

    // A user's own enabled/per-minute preference only applies to their own
    // key — it's their quota, their call. On the shared server key, one
    // person disabling or raising their *personal* limit would also expose
    // everyone else sharing that key, so the shared bucket always uses the
    // server's own default and can never be disabled from a user account.
    if (usesOwnKey && user.aiRateLimitEnabled === false) return next();
    const limit = usesOwnKey ? user.aiRateLimitPerMinute || DEFAULT_LIMIT : DEFAULT_LIMIT;

    const result = checkRateLimit(key, limit);
    if (!result.allowed) {
        const adjustHint = usesOwnKey
            ? "Wait and try again, or adjust it in Settings → Advanced if you understand the risk."
            : "Wait and try again, or add your own API key in Settings to get an independent limit (this shared limit protects everyone using the app's built-in key and can't be adjusted per-user).";
        return res.status(429).json({
            message:
                `You've hit the built-in safety limit of ${limit} AI request${limit === 1 ? "" : "s"} per minute. ` +
                `This protects against unexpected API costs or provider rate-limit errors. ` +
                `${adjustHint} (Retry in ~${result.retryAfterSeconds}s.)`,
            retryAfterSeconds: result.retryAfterSeconds,
        });
    }
    next();
};

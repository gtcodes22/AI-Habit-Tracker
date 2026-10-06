import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
        },
        avatar: {
            type: String,
            default: "",
        },
        morningMotivation: {
            type: Boolean,
            default: false,
        },
        // Per-user AI provider preference. Each provider gets its own model
        // field (a Claude model name means nothing to Ollama, etc.) — empty
        // means "use that provider's server-configured default" (GEMINI_MODEL
        // / OLLAMA_MODEL / ANTHROPIC_MODEL / OPENAI_MODEL).
        aiProvider: {
            type: String,
            enum: ["gemini", "ollama", "claude", "openai"],
            default: "gemini",
        },
        geminiModel: { type: String, default: "", trim: true },
        ollamaModel: { type: String, default: "", trim: true },
        anthropicModel: { type: String, default: "", trim: true },
        openaiModel: { type: String, default: "", trim: true },
        // Where to reach this user's own Ollama install. Empty means "use
        // the server-configured default" (OLLAMA_BASE_URL). Ollama runs as a
        // plain local HTTP server with no auth, so unlike the API keys above
        // this isn't a secret and is stored/returned as plain text.
        ollamaBaseUrl: {
            type: String,
            default: "",
            trim: true,
        },
        // Bring-your-own API keys, stored encrypted (see utils/crypto.js) —
        // never serialized back to the client in readable form. toJSON below
        // strips these and exposes only a hasXKey boolean instead. Gemini is
        // the one provider with a server-wide fallback key, so this is
        // optional for it (falls back to the shared key) but required for
        // claude/openai (which have no server-wide key at all).
        geminiApiKeyEncrypted: {
            type: String,
            default: "",
        },
        anthropicApiKeyEncrypted: {
            type: String,
            default: "",
        },
        openaiApiKeyEncrypted: {
            type: String,
            default: "",
        },
        // Built-in safety limit on AI requests, on by default, to protect a
        // non-technical user from unexpected provider costs or rate-limit
        // errors. Disabling it requires the UI to collect an explicit
        // acknowledgement each time — see Sidebar.jsx.
        aiRateLimitEnabled: {
            type: Boolean,
            default: true,
        },
        aiRateLimitPerMinute: {
            type: Number,
            default: 5,
            min: 1,
            max: 60,
        },
    },
    { timestamps: true }
);

// Hash the password before saving, but only if it was set or changed.
// This keeps profile updates from re-hashing an already hashed password.
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare a plain-text password with the stored hash (used at login).
userSchema.methods.matchPassword = function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
};

// Never send the password hash or stored API keys to the client, even by
// accident. The client only ever learns whether a key is saved, not its
// value — same treatment as the password.
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    obj.hasGeminiKey = !!obj.geminiApiKeyEncrypted;
    obj.hasAnthropicKey = !!obj.anthropicApiKeyEncrypted;
    obj.hasOpenaiKey = !!obj.openaiApiKeyEncrypted;
    delete obj.password;
    delete obj.geminiApiKeyEncrypted;
    delete obj.anthropicApiKeyEncrypted;
    delete obj.openaiApiKeyEncrypted;
    return obj;
};

export default mongoose.model("User", userSchema);

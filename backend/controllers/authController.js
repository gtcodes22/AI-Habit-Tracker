import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { encrypt, encryptionConfigured } from "../utils/crypto.js";

const AI_PROVIDERS = ["gemini", "ollama", "claude", "openai"];

const signToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "30d",
    });

// Turn known database errors into a clean 400; pass anything else on.
const handleWriteError = (err, res, next) => {
    if (err.code === 11000) {
        return res.status(400).json({ message: "Email is already registered" });
    }
    if (err.name === "ValidationError") {
        const first = Object.values(err.errors)[0];
        return res.status(400).json({ message: first.message });
    }
    next(err);
};

// POST /api/auth/register
export const register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        // Require strings so operators like { "$gt": "" } can't reach the query.
        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            !password
        ) {
            return res
                .status(400)
                .json({ message: "Name, email and password are required" });
        }
        if (password.length < 6) {
            return res
                .status(400)
                .json({ message: "Password must be at least 6 characters" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({ message: "Email is already registered" });
        }

        // The password is hashed by the pre-save hook in the User model.
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password,
            avatar: name.trim().charAt(0).toUpperCase(),
        });

        res.status(201).json({ user, token: signToken(user._id) });
    } catch (err) {
        handleWriteError(err, res, next);
    }
};

// POST /api/auth/login
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (typeof email !== "string" || typeof password !== "string") {
            return res
                .status(400)
                .json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // Same message for "no such user" and "wrong password" so we don't
        // reveal which emails are registered.
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        res.json({ user, token: signToken(user._id) });
    } catch (err) {
        next(err);
    }
};

// GET /api/auth/me  (protected)
export const getMe = (req, res) => {
    res.json({ user: req.user });
};

// PUT /api/auth/profile  (protected)
export const updateProfile = async (req, res, next) => {
    try {
        const {
            name,
            morningMotivation,
            aiProvider,
            geminiModel,
            ollamaModel,
            anthropicModel,
            openaiModel,
            ollamaBaseUrl,
            geminiApiKey,
            anthropicApiKey,
            openaiApiKey,
            aiRateLimitEnabled,
            aiRateLimitPerMinute,
        } = req.body;

        if (name !== undefined && (typeof name !== "string" || !name.trim())) {
            return res.status(400).json({ message: "Name cannot be empty" });
        }
        if (
            morningMotivation !== undefined &&
            typeof morningMotivation !== "boolean"
        ) {
            return res
                .status(400)
                .json({ message: "morningMotivation must be true or false" });
        }
        if (aiProvider !== undefined && !AI_PROVIDERS.includes(aiProvider)) {
            return res
                .status(400)
                .json({ message: `aiProvider must be one of: ${AI_PROVIDERS.join(", ")}` });
        }
        const MODEL_FIELDS = { geminiModel, ollamaModel, anthropicModel, openaiModel };
        for (const [field, value] of Object.entries(MODEL_FIELDS)) {
            if (value !== undefined && typeof value !== "string") {
                return res.status(400).json({ message: `${field} must be a string` });
            }
        }
        if (ollamaBaseUrl !== undefined) {
            if (typeof ollamaBaseUrl !== "string") {
                return res.status(400).json({ message: "ollamaBaseUrl must be a string" });
            }
            if (ollamaBaseUrl.trim() && !/^https?:\/\/.+/i.test(ollamaBaseUrl.trim())) {
                return res
                    .status(400)
                    .json({ message: "ollamaBaseUrl must start with http:// or https://" });
            }
        }
        if (geminiApiKey !== undefined && typeof geminiApiKey !== "string") {
            return res.status(400).json({ message: "geminiApiKey must be a string" });
        }
        if (anthropicApiKey !== undefined && typeof anthropicApiKey !== "string") {
            return res.status(400).json({ message: "anthropicApiKey must be a string" });
        }
        if (openaiApiKey !== undefined && typeof openaiApiKey !== "string") {
            return res.status(400).json({ message: "openaiApiKey must be a string" });
        }
        // A non-empty key can only be saved if the server can encrypt it.
        // An empty string (clearing a key) is always allowed.
        const anyKeyBeingSet =
            (geminiApiKey && geminiApiKey.trim()) ||
            (anthropicApiKey && anthropicApiKey.trim()) ||
            (openaiApiKey && openaiApiKey.trim());
        if (anyKeyBeingSet && !encryptionConfigured()) {
            return res.status(500).json({
                message: "Server is not configured to store API keys (ENCRYPTION_KEY missing)",
            });
        }
        if (
            aiRateLimitEnabled !== undefined &&
            typeof aiRateLimitEnabled !== "boolean"
        ) {
            return res
                .status(400)
                .json({ message: "aiRateLimitEnabled must be true or false" });
        }
        if (aiRateLimitPerMinute !== undefined) {
            const n = Number(aiRateLimitPerMinute);
            if (!Number.isInteger(n) || n < 1 || n > 60) {
                return res
                    .status(400)
                    .json({ message: "aiRateLimitPerMinute must be an integer between 1 and 60" });
            }
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (name !== undefined) {
            user.name = name.trim();
            user.avatar = user.name.charAt(0).toUpperCase();
        }
        if (morningMotivation !== undefined) {
            user.morningMotivation = morningMotivation;
        }
        if (aiProvider !== undefined) {
            user.aiProvider = aiProvider;
        }
        if (geminiModel !== undefined) user.geminiModel = geminiModel.trim();
        if (ollamaModel !== undefined) user.ollamaModel = ollamaModel.trim();
        if (anthropicModel !== undefined) user.anthropicModel = anthropicModel.trim();
        if (openaiModel !== undefined) user.openaiModel = openaiModel.trim();
        if (ollamaBaseUrl !== undefined) user.ollamaBaseUrl = ollamaBaseUrl.trim();
        // An empty string clears the saved key; a non-empty one replaces
        // it (encrypted); undefined (the field wasn't sent) leaves it as is
        // — so saving other settings never silently wipes a stored key.
        if (geminiApiKey !== undefined) {
            user.geminiApiKeyEncrypted = geminiApiKey.trim() ? encrypt(geminiApiKey.trim()) : "";
        }
        if (anthropicApiKey !== undefined) {
            user.anthropicApiKeyEncrypted = anthropicApiKey.trim()
                ? encrypt(anthropicApiKey.trim())
                : "";
        }
        if (openaiApiKey !== undefined) {
            user.openaiApiKeyEncrypted = openaiApiKey.trim()
                ? encrypt(openaiApiKey.trim())
                : "";
        }
        if (aiRateLimitEnabled !== undefined) {
            user.aiRateLimitEnabled = aiRateLimitEnabled;
        }
        if (aiRateLimitPerMinute !== undefined) {
            user.aiRateLimitPerMinute = Number(aiRateLimitPerMinute);
        }

        await user.save();
        res.json({ user });
    } catch (err) {
        handleWriteError(err, res, next);
    }
};

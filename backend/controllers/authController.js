import jwt from "jsonwebtoken";
import User from "../models/User.js";

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
        const { name, morningMotivation } = req.body;

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

        await user.save();
        res.json({ user });
    } catch (err) {
        handleWriteError(err, res, next);
    }
};

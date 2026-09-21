import express from "express";
import {
    register,
    login,
    getMe,
    updateProfile,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Public
router.post("/register", register);
router.post("/login", login);

// Protected (valid JWT required)
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);

export default router;

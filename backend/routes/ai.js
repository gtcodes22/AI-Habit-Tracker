import express from "express";
import {
    getWeeklyReport,
    getSuggestions,
    getRecoveryPlan,
    getChatAnswer,
    getMorningMotivation,
    getOllamaModels,
} from "../controllers/aiController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Every AI route requires authentication.
router.use(protect);

router.post("/weekly-report", getWeeklyReport);
router.post("/suggest-habits", getSuggestions);
router.post("/recovery-plan", getRecoveryPlan);
router.post("/chat", getChatAnswer);
router.get("/morning", getMorningMotivation);
router.get("/ollama-models", getOllamaModels);

export default router;

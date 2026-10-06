import express from "express";
import {
    getWeeklyReport,
    getSuggestions,
    getRecoveryPlan,
    getChatAnswer,
    getMorningMotivation,
    getOllamaModels,
    testAIConnection,
} from "../controllers/aiController.js";
import { protect } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/aiRateLimit.js";

const router = express.Router();

// Every AI route requires authentication.
router.use(protect);

// The rate limiter only applies to the five content-generating routes —
// not /ollama-models (a passive check) or /test-connection (a deliberate,
// infrequent "verify my key" action that shouldn't itself be throttled).
router.post("/weekly-report", aiRateLimit, getWeeklyReport);
router.post("/suggest-habits", aiRateLimit, getSuggestions);
router.post("/recovery-plan", aiRateLimit, getRecoveryPlan);
router.post("/chat", aiRateLimit, getChatAnswer);
router.get("/morning", aiRateLimit, getMorningMotivation);
router.get("/ollama-models", getOllamaModels);
router.post("/test-connection", testAIConnection);

export default router;

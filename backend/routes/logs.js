import express from "express";
import {
    markComplete,
    unmarkComplete,
    getToday,
    getRange,
    getHeatmap,
    getStats,
    getHabitStats,
} from "../controllers/logController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Every log route requires authentication.
router.use(protect);

router.post("/", markComplete);
router.delete("/", unmarkComplete);

router.get("/today", getToday);
router.get("/range", getRange);
router.get("/heatmap", getHeatmap);

router.get("/stats", getStats);
router.get("/stats/:habitId", getHabitStats);

export default router;

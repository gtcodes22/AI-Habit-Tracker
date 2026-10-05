import express from "express";
import {
    getHabits,
    createHabit,
    updateHabit,
    archiveHabit,
    deleteHabit,
    reorderHabits,
} from "../controllers/habitController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Every habit route requires authentication.
router.use(protect);

router.get("/", getHabits);
router.post("/", createHabit);

// /reorder must be declared before /:id, or Express would treat "reorder"
// as an :id value and route it to updateHabit instead.
router.put("/reorder", reorderHabits);

router.put("/:id/archive", archiveHabit);
router.put("/:id", updateHabit);
router.delete("/:id", deleteHabit);

export default router;
import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import { todayKey, lastNDays, last90Days, calcStreak } from "../utils/dateHelpers.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A malformed ObjectId (bad habitId, bad :habitId param) is treated as
// "not found" rather than a 500.
const isCastError = (err) => err.name === "CastError";

// POST /api/logs  — mark a habit complete for a day (defaults to today)
export const markComplete = async (req, res, next) => {
    try {
        const { habitId, date } = req.body;

        if (typeof habitId !== "string" || !habitId) {
            return res.status(400).json({ message: "habitId is required" });
        }
        if (date !== undefined && (typeof date !== "string" || !DATE_RE.test(date))) {
            return res.status(400).json({ message: "date must be yyyy-MM-dd" });
        }
        const completedDate = date || todayKey();

        // Scope the habit lookup to this user so a log can never be
        // attached to someone else's habit.
        const habit = await Habit.findOne({ _id: habitId, userId: req.user._id });
        if (!habit) return res.status(404).json({ message: "Habit not found" });

        let log;
        try {
            // Idempotent upsert: calling this twice for the same habit and
            // day returns the existing log instead of erroring.
            log = await HabitLog.findOneAndUpdate(
                { userId: req.user._id, habitId, completedDate },
                { $setOnInsert: { userId: req.user._id, habitId, completedDate } },
                { new: true, upsert: true }
            );
        } catch (err) {
            if (err.code === 11000) {
                // Lost a race with a concurrent identical request — the log
                // exists now, so just return it.
                log = await HabitLog.findOne({ userId: req.user._id, habitId, completedDate });
            } else {
                throw err;
            }
        }

        res.status(201).json(log);
    } catch (err) {
        if (isCastError(err)) return res.status(404).json({ message: "Habit not found" });
        next(err);
    }
};

// DELETE /api/logs  — unmark a habit for a day (defaults to today)
export const unmarkComplete = async (req, res, next) => {
    try {
        const { habitId, date } = req.body;

        if (typeof habitId !== "string" || !habitId) {
            return res.status(400).json({ message: "habitId is required" });
        }
        if (date !== undefined && (typeof date !== "string" || !DATE_RE.test(date))) {
            return res.status(400).json({ message: "date must be yyyy-MM-dd" });
        }
        const completedDate = date || todayKey();

        await HabitLog.deleteOne({ userId: req.user._id, habitId, completedDate });
        res.json({ message: "Unmarked" });
    } catch (err) {
        if (isCastError(err)) return res.status(404).json({ message: "Habit not found" });
        next(err);
    }
};

// GET /api/logs/today
export const getToday = async (req, res, next) => {
    try {
        const logs = await HabitLog.find({
            userId: req.user._id,
            completedDate: todayKey(),
        });
        res.json(logs);
    } catch (err) {
        next(err);
    }
};

// GET /api/logs/range?start=yyyy-MM-dd&end=yyyy-MM-dd
export const getRange = async (req, res, next) => {
    try {
        const { start, end } = req.query;
        if (
            typeof start !== "string" ||
            typeof end !== "string" ||
            !DATE_RE.test(start) ||
            !DATE_RE.test(end)
        ) {
            return res
                .status(400)
                .json({ message: "start and end are required as yyyy-MM-dd" });
        }

        const logs = await HabitLog.find({
            userId: req.user._id,
            completedDate: { $gte: start, $lte: end },
        });
        res.json(logs);
    } catch (err) {
        next(err);
    }
};

// GET /api/logs/heatmap  — last 90 days, oldest first
export const getHeatmap = async (req, res, next) => {
    try {
        const days = last90Days();
        const logs = await HabitLog.find({
            userId: req.user._id,
            completedDate: { $gte: days[0], $lte: days[days.length - 1] },
        });

        const counts = new Map(days.map((d) => [d, 0]));
        for (const log of logs) {
            counts.set(log.completedDate, (counts.get(log.completedDate) || 0) + 1);
        }

        res.json(days.map((date) => ({ date, count: counts.get(date) || 0 })));
    } catch (err) {
        next(err);
    }
};

// GET /api/logs/stats  — per-habit summary over the last 30 days
// (non-archived habits only; streaks are computed from that same window,
// matching the frontend's mock implementation).
export const getStats = async (req, res, next) => {
    try {
        const days = lastNDays(30);
        const habits = await Habit.find({ userId: req.user._id, isArchived: false });
        const habitIds = habits.map((h) => h._id);

        const logs = await HabitLog.find({
            userId: req.user._id,
            habitId: { $in: habitIds },
            completedDate: { $gte: days[0], $lte: days[days.length - 1] },
        });

        const datesByHabit = new Map();
        for (const log of logs) {
            const key = String(log.habitId);
            if (!datesByHabit.has(key)) datesByHabit.set(key, []);
            datesByHabit.get(key).push(log.completedDate);
        }

        const perHabit = habits.map((h) => {
            const dates = datesByHabit.get(String(h._id)) || [];
            const { current, longest } = calcStreak(dates);
            return {
                habitId: h._id,
                name: h.name,
                icon: h.icon,
                color: h.color,
                category: h.category,
                completions30d: dates.length,
                currentStreak: current,
                longestStreak: longest,
            };
        });

        res.json({ perHabit, days });
    } catch (err) {
        next(err);
    }
};

// GET /api/logs/stats/:habitId  — full history for one habit
export const getHabitStats = async (req, res, next) => {
    try {
        const habit = await Habit.findOne({
            _id: req.params.habitId,
            userId: req.user._id,
        });
        if (!habit) return res.status(404).json({ message: "Habit not found" });

        const logs = await HabitLog.find({
            userId: req.user._id,
            habitId: habit._id,
        }).sort({ completedDate: -1 });

        const dates = logs.map((l) => l.completedDate);
        const { current, longest } = calcStreak(dates);

        const daysSinceCreated = Math.max(
            1,
            Math.floor((Date.now() - habit.createdAt.getTime()) / (1000 * 60 * 60 * 24)) + 1
        );
        const completionRate = Math.min(
            100,
            Math.round((logs.length / daysSinceCreated) * 100)
        );

        const monthly = {};
        for (const date of dates) {
            const month = date.slice(0, 7); // "yyyy-MM"
            monthly[month] = (monthly[month] || 0) + 1;
        }

        res.json({
            habit,
            totalCompletions: logs.length,
            currentStreak: current,
            longestStreak: longest,
            completionRate,
            monthly,
        });
    } catch (err) {
        if (isCastError(err)) return res.status(404).json({ message: "Habit not found" });
        next(err);
    }
};

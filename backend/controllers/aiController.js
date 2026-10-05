import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import AIInsight from "../models/AIInsight.js";
import {
    chatCompletion,
    parseJSON,
    PROMPTS,
    sanitizeSuggestion,
    DEFAULT_SUGGESTIONS,
    resolveProviderAndModel,
    fetchOllamaModels,
} from "../utils/aiService.js";
import { lastNDays, todayKey, calcStreak } from "../utils/dateHelpers.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isCastError = (err) => err.name === "CastError";

// A user's saved AI preference, in the shape chatCompletion()'s override
// expects. An empty aiModel means "use that provider's server default",
// so it's dropped rather than passed through as an empty string.
const userOverride = (user) => ({
    provider: user.aiProvider,
    model: user.aiModel || undefined,
});

// Recorded on every AIInsight so results can be compared across
// providers/users later (see docs/ideas.md).
const providerMeta = (override) => resolveProviderAndModel(override);

// Groups a list of HabitLog documents by habitId, returning a
// Map<habitIdString, dateKey[]>.
const groupDatesByHabit = (logs) => {
    const map = new Map();
    for (const log of logs) {
        const key = String(log.habitId);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(log.completedDate);
    }
    return map;
};

// POST /api/ai/weekly-report
export const getWeeklyReport = async (req, res, next) => {
    try {
        const habits = await Habit.find({ userId: req.user._id, isArchived: false });
        if (!habits.length) {
            return res.json({
                content:
                    "You don't have any active habits yet. Add a habit to start getting personalized weekly reports!",
            });
        }

        const days = lastNDays(7);
        const habitIds = habits.map((h) => h._id);
        const logs = await HabitLog.find({
            userId: req.user._id,
            habitId: { $in: habitIds },
            completedDate: { $gte: days[0], $lte: days[days.length - 1] },
        });
        const datesByHabit = groupDatesByHabit(logs);

        const lines = habits.map((h) => {
            const dates = datesByHabit.get(String(h._id)) || [];
            return `- ${h.name} (${h.category}, ${h.frequency}, target ${h.targetDays}/week): completed ${dates.length}/7 days this week`;
        });
        const userMessage = `This user's habit data for the last 7 days (${days[0]} to ${days[days.length - 1]}):\n${lines.join("\n")}`;

        const override = userOverride(req.user);
        const content = await chatCompletion(PROMPTS.weekly, userMessage, 0.7, override);
        await AIInsight.create({ userId: req.user._id, type: "weekly", content, meta: providerMeta(override) });
        res.json({ content });
    } catch (err) {
        next(err);
    }
};

// POST /api/ai/suggest-habits
export const getSuggestions = async (req, res, next) => {
    try {
        const { goals, productiveTime, struggles } = req.body;
        if (
            typeof goals !== "string" ||
            typeof productiveTime !== "string" ||
            typeof struggles !== "string" ||
            !goals.trim() ||
            !productiveTime.trim() ||
            !struggles.trim()
        ) {
            return res
                .status(400)
                .json({ message: "goals, productiveTime and struggles are required" });
        }

        const userMessage = `Goals: ${goals}\nMost productive time of day: ${productiveTime}\nHabits struggled with before: ${struggles}`;

        // This endpoint is designed to never fail the user: a Gemini outage,
        // a rate limit, or just malformed JSON all fall back to the same
        // hard-coded suggestions rather than surfacing an error.
        const override = userOverride(req.user);
        let suggestions;
        try {
            const raw = await chatCompletion(PROMPTS.suggestion, userMessage, 0.7, override);
            const parsed = parseJSON(raw);
            const list = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed?.suggestions)
                    ? parsed.suggestions
                    : null;
            if (!list || !list.length) throw new Error("not a usable list");
            suggestions = list.slice(0, 3).map(sanitizeSuggestion);
        } catch {
            suggestions = DEFAULT_SUGGESTIONS;
        }

        await AIInsight.create({
            userId: req.user._id,
            type: "suggestion",
            content: JSON.stringify(suggestions),
            meta: { goals, productiveTime, struggles, ...providerMeta(override) },
        });
        res.json({ suggestions });
    } catch (err) {
        next(err);
    }
};

// POST /api/ai/recovery-plan
export const getRecoveryPlan = async (req, res, next) => {
    try {
        const { habitId } = req.body;
        if (typeof habitId !== "string" || !habitId) {
            return res.status(400).json({ message: "habitId is required" });
        }

        const habit = await Habit.findOne({ _id: habitId, userId: req.user._id });
        if (!habit) return res.status(404).json({ message: "Habit not found" });

        const logs = await HabitLog.find({ userId: req.user._id, habitId: habit._id });
        const { current, longest } = calcStreak(logs.map((l) => l.completedDate));

        const userMessage = `Habit: ${habit.name} (${habit.category})\nCurrent streak: ${current} days\nLongest streak ever: ${longest} days\nThe user recently broke their streak on this habit and wants help getting back on track.`;
        const override = userOverride(req.user);
        const content = await chatCompletion(PROMPTS.recovery, userMessage, 0.7, override);

        await AIInsight.create({
            userId: req.user._id,
            type: "recovery",
            content,
            meta: { habitId: habit._id, ...providerMeta(override) },
        });
        res.json({ content });
    } catch (err) {
        if (isCastError(err)) return res.status(404).json({ message: "Habit not found" });
        next(err);
    }
};

// POST /api/ai/chat
export const getChatAnswer = async (req, res, next) => {
    try {
        const { question } = req.body;
        if (typeof question !== "string" || !question.trim()) {
            return res.status(400).json({ message: "question is required" });
        }

        const habits = await Habit.find({ userId: req.user._id, isArchived: false });
        if (!habits.length) {
            return res.json({
                content:
                    "You don't have any active habits yet, so I don't have any data to analyze. Add a few habits and check them off for a while, then come back and ask me!",
            });
        }

        const days = lastNDays(30);
        const habitIds = habits.map((h) => h._id);
        const logs = await HabitLog.find({
            userId: req.user._id,
            habitId: { $in: habitIds },
            completedDate: { $gte: days[0], $lte: days[days.length - 1] },
        });
        const datesByHabit = groupDatesByHabit(logs);

        const lines = habits.map((h) => {
            const dates = datesByHabit.get(String(h._id)) || [];
            const perWeekday = WEEKDAYS.map(() => 0);
            for (const d of dates) {
                perWeekday[new Date(`${d}T00:00:00`).getDay()] += 1;
            }
            const breakdown = WEEKDAYS.map((w, i) => `${w}: ${perWeekday[i]}`).join(", ");
            return `- ${h.name} (${h.category}, target ${h.targetDays}/week): ${dates.length}/30 days completed. By day of week — ${breakdown}.`;
        });
        const userMessage = `Habit data for the last 30 days:\n${lines.join("\n")}\n\nQuestion: ${question}`;

        const override = userOverride(req.user);
        const content = await chatCompletion(PROMPTS.chat, userMessage, 0.7, override);
        await AIInsight.create({
            userId: req.user._id,
            type: "chat",
            content,
            meta: { question, ...providerMeta(override) },
        });
        res.json({ content });
    } catch (err) {
        next(err);
    }
};

// GET /api/ai/morning
export const getMorningMotivation = async (req, res, next) => {
    try {
        const habits = await Habit.find({ userId: req.user._id, isArchived: false });
        if (!habits.length) {
            return res.json({
                content: "Welcome! Add your first habit to start building momentum today.",
            });
        }

        const habitIds = habits.map((h) => h._id);
        const [logs, doneToday] = await Promise.all([
            HabitLog.find({ userId: req.user._id, habitId: { $in: habitIds } }),
            HabitLog.countDocuments({
                userId: req.user._id,
                habitId: { $in: habitIds },
                completedDate: todayKey(),
            }),
        ]);
        const datesByHabit = groupDatesByHabit(logs);

        const lines = habits.map((h) => {
            const dates = datesByHabit.get(String(h._id)) || [];
            const { current } = calcStreak(dates);
            return `- ${h.name}: current streak ${current} day${current === 1 ? "" : "s"}`;
        });
        const userMessage = `This user has ${habits.length} active habit(s), ${doneToday} completed so far today.\n${lines.join("\n")}`;

        // Higher temperature: this runs every day, so more variety helps it
        // not feel repetitive.
        const override = userOverride(req.user);
        const content = await chatCompletion(PROMPTS.morning, userMessage, 0.8, override);
        await AIInsight.create({ userId: req.user._id, type: "morning", content, meta: providerMeta(override) });
        res.json({ content });
    } catch (err) {
        next(err);
    }
};

// GET /api/ai/ollama-models
// Lists the models currently pulled on the local Ollama install, and
// doubles as a connectivity check for the Settings UI's "Test connection".
export const getOllamaModels = async (req, res, next) => {
    try {
        const result = await fetchOllamaModels();
        res.json(result);
    } catch (err) {
        next(err);
    }
};

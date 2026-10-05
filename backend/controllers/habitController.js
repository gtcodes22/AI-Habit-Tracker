import Habit, { CATEGORIES, FREQUENCIES } from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";

// Fields a client is allowed to set on create/update. userId and order are
// controlled by the server, never taken from the request body.
const ALLOWED_FIELDS = [
    "name",
    "description",
    "category",
    "frequency",
    "targetDays",
    "color",
    "icon",
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Validate the subset of fields present in `body`. Returns an error message
// string, or null if everything present is valid.
const validateFields = (body) => {
    if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim()) {
            return "Name must be a non-empty string";
        }
    }
    if (body.description !== undefined && typeof body.description !== "string") {
        return "Description must be a string";
    }
    if (body.category !== undefined && !CATEGORIES.includes(body.category)) {
        return `Category must be one of: ${CATEGORIES.join(", ")}`;
    }
    if (body.frequency !== undefined && !FREQUENCIES.includes(body.frequency)) {
        return `Frequency must be one of: ${FREQUENCIES.join(", ")}`;
    }
    if (body.targetDays !== undefined) {
        const n = Number(body.targetDays);
        if (!Number.isInteger(n) || n < 1 || n > 7) {
            return "targetDays must be an integer between 1 and 7";
        }
    }
    if (body.color !== undefined && !HEX_COLOR.test(body.color)) {
        return "Color must be a hex value like #6366f1";
    }
    if (body.icon !== undefined && typeof body.icon !== "string") {
        return "Icon must be a string";
    }
    return null;
};

const pickAllowed = (body) => {
    const out = {};
    for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) out[key] = body[key];
    }
    if (typeof out.name === "string") out.name = out.name.trim();
    if (typeof out.description === "string") out.description = out.description.trim();
    return out;
};

// Treat a malformed ObjectId the same as "not found" rather than a 500.
const isCastError = (err) => err.name === "CastError" && err.path === "_id";

// GET /api/habits
export const getHabits = async (req, res, next) => {
    try {
        const includeArchived = req.query.includeArchived === "true";
        const filter = { userId: req.user._id };
        if (!includeArchived) filter.isArchived = false;

        const habits = await Habit.find(filter).sort({
            order: 1,
            createdAt: 1,
        });
        res.json(habits);
    } catch (err) {
        next(err);
    }
};

// POST /api/habits
export const createHabit = async (req, res, next) => {
    try {
        const invalid = validateFields(req.body);
        if (invalid) return res.status(400).json({ message: invalid });
        if (!req.body.name) {
            return res.status(400).json({ message: "Name is required" });
        }

        const order = await Habit.countDocuments({ userId: req.user._id });
        const habit = await Habit.create({
            ...pickAllowed(req.body),
            userId: req.user._id,
            order,
        });
        res.status(201).json(habit);
    } catch (err) {
        if (err.name === "ValidationError") {
            return res.status(400).json({ message: Object.values(err.errors)[0].message });
        }
        next(err);
    }
};

// PUT /api/habits/:id
export const updateHabit = async (req, res, next) => {
    try {
        const invalid = validateFields(req.body);
        if (invalid) return res.status(400).json({ message: invalid });

        const habit = await Habit.findOne({ _id: req.params.id, userId: req.user._id });
        if (!habit) return res.status(404).json({ message: "Habit not found" });

        Object.assign(habit, pickAllowed(req.body));
        await habit.save();
        res.json(habit);
    } catch (err) {
        if (isCastError(err)) return res.status(404).json({ message: "Habit not found" });
        if (err.name === "ValidationError") {
            return res.status(400).json({ message: Object.values(err.errors)[0].message });
        }
        next(err);
    }
};

// PUT /api/habits/:id/archive  (toggle)
export const archiveHabit = async (req, res, next) => {
    try {
        const habit = await Habit.findOne({ _id: req.params.id, userId: req.user._id });
        if (!habit) return res.status(404).json({ message: "Habit not found" });

        habit.isArchived = !habit.isArchived;
        await habit.save();
        res.json(habit);
    } catch (err) {
        if (isCastError(err)) return res.status(404).json({ message: "Habit not found" });
        next(err);
    }
};

// DELETE /api/habits/:id
// Cascades: also removes every log recorded against this habit, so no
// orphaned logs are left behind for a habit that no longer exists.
export const deleteHabit = async (req, res, next) => {
    try {
        const habit = await Habit.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id,
        });
        if (!habit) return res.status(404).json({ message: "Habit not found" });

        await HabitLog.deleteMany({ habitId: habit._id, userId: req.user._id });

        res.json({ message: "Deleted" });
    } catch (err) {
        if (isCastError(err)) return res.status(404).json({ message: "Habit not found" });
        next(err);
    }
};

// PUT /api/habits/reorder
// Body: { order: [habitId, habitId, ...] } in the desired display order.
export const reorderHabits = async (req, res, next) => {
    try {
        const { order } = req.body;
        if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
            return res
                .status(400)
                .json({ message: "order must be an array of habit ids" });
        }

        // Scoped by userId, so an id for someone else's habit is simply a
        // no-op rather than a security hole.
        await Promise.all(
            order.map((habitId, index) =>
                Habit.updateOne(
                    { _id: habitId, userId: req.user._id },
                    { order: index }
                ).catch((err) => {
                    if (isCastError(err)) return null; // ignore malformed ids
                    throw err;
                })
            )
        );

        const habits = await Habit.find({ userId: req.user._id }).sort({
            order: 1,
            createdAt: 1,
        });
        res.json(habits);
    } catch (err) {
        next(err);
    }
};

import mongoose from "mongoose";

// One document per habit per completed day. completedDate is stored as a
// "yyyy-MM-dd" string (not a Date) to avoid timezone bugs and keep range
// queries simple string comparisons.
const habitLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        habitId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Habit",
            required: true,
            index: true,
        },
        completedDate: {
            type: String,
            required: true,
            match: [/^\d{4}-\d{2}-\d{2}$/, "completedDate must be yyyy-MM-dd"],
        },
        notes: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

// The database itself guarantees at most one log per habit per day.
habitLogSchema.index(
    { userId: 1, habitId: 1, completedDate: 1 },
    { unique: true }
);

export default mongoose.model("HabitLog", habitLogSchema);

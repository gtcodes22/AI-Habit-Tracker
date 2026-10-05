import mongoose from "mongoose";

// Capitalized to match the frontend exactly (src/utils/constants.js).
// Exported so other files (the AI suggestion prompt, validation) can reuse it.
export const CATEGORIES = [
    "Health",
    "Fitness",
    "Learning",
    "Mindfulness",
    "Productivity",
    "Social",
    "Finance",
    "Creative",
    "Other",
];

export const FREQUENCIES = ["daily", "weekly"];

const habitSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        category: {
            type: String,
            enum: CATEGORIES,
            default: "Other",
        },
        frequency: {
            type: String,
            enum: FREQUENCIES,
            default: "daily",
        },
        targetDays: {
            type: Number,
            min: 1,
            max: 7,
            default: 7,
        },
        color: {
            type: String,
            default: "#6366f1",
        },
        icon: {
            type: String,
            default: "🎯",
        },
        isArchived: {
            type: Boolean,
            default: false,
        },
        order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

export default mongoose.model("Habit", habitSchema);

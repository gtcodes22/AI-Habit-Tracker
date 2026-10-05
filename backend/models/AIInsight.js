import mongoose from "mongoose";

// Stores every AI-generated response: a history for the user, a hook for
// future caching, and useful data if the prompts ever need tuning.
const aiInsightSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["weekly", "suggestion", "recovery", "chat", "morning"],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        // Extra context for the type, e.g. { question } for chat, or
        // { habitId } for a recovery plan.
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        generatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

export default mongoose.model("AIInsight", aiInsightSchema);

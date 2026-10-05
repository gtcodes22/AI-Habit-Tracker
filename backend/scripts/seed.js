// Populates the database with a demo user, 7 habits, and ~90 days of
// realistic completion history — handy for demos, screenshots, or just
// having something to look at besides an empty dashboard.
//
// Run with: npm run seed
// Safe to re-run: it wipes and rebuilds the SAME demo user every time, by
// email, and touches nothing else in the database.
import "dotenv/config";
import { subDays, format } from "date-fns";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import AIInsight from "../models/AIInsight.js";

// Override with SEED_EMAIL / SEED_PASSWORD env vars if you'd rather not use
// these defaults.
const DEMO_NAME = "Alex Rivera";
const DEMO_EMAIL = process.env.SEED_EMAIL || "demo@habittracker.local";
const DEMO_PASSWORD = process.env.SEED_PASSWORD || "Demo1234!";

const dateKey = (daysAgo) => format(subDays(new Date(), daysAgo), "yyyy-MM-dd");

// Each habit's `_streakProb` is its base odds of being completed on any
// given day. `_pattern: "weekdays"` cuts weekend odds way down; "dropoff"
// weakens the most recent two weeks (a habit the user is currently
// struggling with); `_brokeAt` forces a 5-day gap around that day offset,
// guaranteeing a visibly broken streak to show off the recovery feature.
const HABITS = [
    {
        name: "Drink 2L of water",
        description: "Stay hydrated throughout the day.",
        category: "Health",
        color: "#0ea5e9",
        icon: "💧",
        order: 0,
        _streakProb: 0.95,
    },
    {
        name: "Morning run",
        description: "30-minute run before breakfast.",
        category: "Fitness",
        targetDays: 5,
        color: "#ef4444",
        icon: "🏃",
        order: 1,
        _streakProb: 0.7,
        _pattern: "weekdays",
        _brokeAt: 20,
    },
    {
        name: "Read 20 minutes",
        description: "Fiction or non-fiction, no phone.",
        category: "Learning",
        color: "#6366f1",
        icon: "📚",
        order: 2,
        _streakProb: 0.82,
    },
    {
        name: "Meditate",
        description: "10 minutes of breath-focused meditation.",
        category: "Mindfulness",
        color: "#8b5cf6",
        icon: "🧘",
        order: 3,
        _streakProb: 0.6,
    },
    {
        name: "Journal",
        description: "Write 3 things I'm grateful for.",
        category: "Mindfulness",
        targetDays: 5,
        color: "#ec4899",
        icon: "✍️",
        order: 4,
        _streakProb: 0.75,
        _pattern: "dropoff",
    },
    {
        name: "Strength training",
        description: "Push/pull/legs split.",
        category: "Fitness",
        frequency: "weekly",
        targetDays: 3,
        color: "#f59e0b",
        icon: "💪",
        order: 5,
        _streakProb: 0.55,
        _pattern: "weekdays",
    },
    {
        name: "Side project — 1hr",
        description: "Ship something small every day.",
        category: "Productivity",
        targetDays: 6,
        color: "#14b8a6",
        icon: "🎯",
        order: 6,
        _streakProb: 0.78,
    },
];

// Deterministic pseudo-random logs over the last 90 days, so re-seeding
// produces the same data every time (handy for demos/screenshots).
const buildLogDates = (habit) => {
    const dates = [];
    for (let i = 0; i < 90; i++) {
        let p = habit._streakProb;
        const day = subDays(new Date(), i).getDay(); // 0 = Sunday, 6 = Saturday
        if (habit._pattern === "weekdays" && (day === 0 || day === 6)) p *= 0.35;
        if (habit._pattern === "dropoff" && i < 14) p *= 0.25;
        if (habit._brokeAt && i >= habit._brokeAt - 2 && i <= habit._brokeAt + 2) continue;

        const seed = Math.sin(i * 9301 + habit.name.length * 49297) * 233280;
        const rnd = seed - Math.floor(seed);
        if (rnd < p) dates.push(dateKey(i));
    }
    return dates;
};

async function run() {
    await connectDB();

    let user = await User.findOne({ email: DEMO_EMAIL });
    if (user) {
        console.log(`Demo user already exists — wiping their habits, logs and AI insights...`);
        await Habit.deleteMany({ userId: user._id });
        await HabitLog.deleteMany({ userId: user._id });
        await AIInsight.deleteMany({ userId: user._id });
        user.name = DEMO_NAME;
        user.password = DEMO_PASSWORD; // re-hashed by the pre-save hook
        user.avatar = DEMO_NAME.charAt(0).toUpperCase();
        user.morningMotivation = true;
        await user.save();
    } else {
        user = await User.create({
            name: DEMO_NAME,
            email: DEMO_EMAIL,
            password: DEMO_PASSWORD,
            avatar: DEMO_NAME.charAt(0).toUpperCase(),
            morningMotivation: true,
        });
    }

    let totalLogs = 0;
    const createdHabits = [];

    for (const spec of HABITS) {
        // Strip the underscore-prefixed seeding-control fields before
        // creating the real document — they aren't part of the schema.
        const { _streakProb, _pattern, _brokeAt, ...fields } = spec;

        const habit = await Habit.create({ ...fields, userId: user._id });

        // Backdate createdAt/updatedAt to 89 days ago (via the raw driver,
        // bypassing Mongoose's timestamps middleware) so completionRate and
        // streak math reflect a habit with real history, not one created
        // seconds ago.
        const backdate = subDays(new Date(), 89);
        await Habit.collection.updateOne(
            { _id: habit._id },
            { $set: { createdAt: backdate, updatedAt: backdate } }
        );

        const dates = buildLogDates(spec);
        if (dates.length) {
            try {
                await HabitLog.insertMany(
                    dates.map((completedDate) => ({ userId: user._id, habitId: habit._id, completedDate })),
                    { ordered: false }
                );
            } catch (err) {
                // Duplicate-key errors from the unique index are harmless
                // here (shouldn't happen against a freshly-wiped habit, but
                // ordered:false means any real duplicates are skipped
                // rather than aborting the whole batch).
                if (err.code !== 11000 && !err.writeErrors) throw err;
            }
        }

        totalLogs += dates.length;
        createdHabits.push({ habit, dates });
    }

    // Make sure the first 4 habits show as done today, for an interesting
    // "Today" view right after seeding.
    const today = dateKey(0);
    for (const { habit, dates } of createdHabits.slice(0, 4)) {
        if (!dates.includes(today)) {
            await HabitLog.findOneAndUpdate(
                { userId: user._id, habitId: habit._id, completedDate: today },
                { $setOnInsert: { userId: user._id, habitId: habit._id, completedDate: today } },
                { upsert: true }
            );
            totalLogs += 1;
        }
    }

    console.log("\nSeed complete!");
    console.log(`  Email:    ${DEMO_EMAIL}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    console.log(`  Habits:   ${createdHabits.length}`);
    console.log(`  Logs:     ~${totalLogs}`);
    console.log("\nRun `npm run seed` again anytime to reset this demo account.");
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Seed failed:", err);
        process.exit(1);
    });

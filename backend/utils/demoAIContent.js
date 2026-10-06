// Static AI sample content for the seeded demo account — lets a brand-new
// visitor see every AI feature working immediately, with zero live
// provider calls (so onboarding never touches the shared Gemini key, a
// user's BYOK key, or any quota/cost at all).
//
// This is the same sample text the frontend's old mock API (deleted in the
// Phase 7 cutover) used, which already matches the demo persona's actual
// seeded habits ("Drink 2L of water", "Morning run", "Journal", etc. — see
// scripts/seed.js) and name ("Alex") — so it reads as genuinely consistent
// with the seeded data rather than generic placeholder text.
//
// The email this applies to is the same one scripts/seed.js uses, so
// overriding SEED_EMAIL also moves which account gets this treatment.
export const DEMO_EMAIL = process.env.SEED_EMAIL || "demo@habittracker.local";

export const isDemoUser = (user) => user?.email === DEMO_EMAIL;

export const DEMO_AI_CONTENT = {
    weeklyReport: `Big week for hydration — you hit **Drink 2L of water** every single day, which is a real anchor habit forming.

Your **morning runs** slipped to 3/5 on weekdays — you're strongest Mon–Wed and tend to lose momentum mid-week. Reading and side-project work both held steady around 5/7 days.

One pattern worth noting: weekend completions across the board dropped about 30%. That's normal, but if you want to keep the streaks alive, try setting one tiny weekend version of each habit (a 5-minute walk instead of a full run, for example).

Overall this was a strong week. The fact that water is now automatic frees up willpower to focus on the trickier ones. Proud of you — keep going.`,

    recovery: `You had a great run with **Morning run** — 14 days at one point. Broken streaks are part of the journey, not the end of it.

**Day 1:** No pressure. Lace up your shoes and do a 10-minute walk-jog. The goal isn't pace, it's just showing up.

**Day 2:** 20 minutes at an easy pace. Pick a route you actually like.

**Day 3:** Back to your usual 30-minute run. By now the inertia has flipped.

Most streaks don't break because of motivation — they break because of friction. Try laying out your shoes the night before. Small setup, big payoff.`,

    morning: `Good morning, Alex! You're sitting on a **12-day water streak** — keep that going, it's the easiest win of your day. 💧 One small nudge: your **journal** habit needs a few minutes today to keep momentum. You've got this.`,

    chat: {
        default:
            "Hi — ask me anything about your habit data. I have your last 30 days loaded as context.",
        "Which day of the week am I most consistent?":
            "Looking at the past 30 days, **Monday** is your strongest day — averaging 5.2 completions per Monday. **Sunday** is the weakest at 2.8. The dip starts on Friday and bottoms out on Sunday.",
        "What is my best performing category?":
            "**Health** is your top category with 52 completions in the last 30 days, driven mostly by *Drink 2L water*. **Mindfulness** is the weakest at 28 completions — *Journal* in particular has slipped recently.",
        "Why do I keep failing my exercise habit?":
            "Your **Morning run** habit is at 19/30 in the last 30 days. The pattern is clear: weekdays are 80% strong, weekends drop to 35%. The breaks tend to start on Saturday and don't recover until Monday. A weekend-friendly alternative (like a short walk) might keep the streak alive.",
    },

    suggestions: [
        {
            name: "5-minute morning stretch",
            description: "Loosen up before the day starts.",
            frequency: "daily",
            category: "Health",
            icon: "🧘",
            reason: "Pairs naturally with your existing morning habits and takes almost no willpower.",
        },
        {
            name: "No screens for the first 30 minutes",
            description: "Start the morning offline.",
            frequency: "daily",
            category: "Mindfulness",
            icon: "😴",
            reason: "Helps your meditation habit stick and reduces decision fatigue early in the day.",
        },
        {
            name: "Weekly long walk",
            description: "60–90 minutes outdoors on Sunday.",
            frequency: "weekly",
            category: "Fitness",
            icon: "🚶",
            reason: "Gives you a low-friction movement habit on weekends when your run consistency drops.",
        },
    ],
};

// Mirrors the old mock API's keyword-matching behavior: match a question
// against the canned keys (case-insensitive, prefix match on the first 25
// chars), falling back to a generic-but-honest default rather than a
// fabricated-looking non-answer.
export const demoChatAnswer = (question) => {
    const q = (question || "").toLowerCase();
    const match = Object.entries(DEMO_AI_CONTENT.chat).find(
        ([key]) => key !== "default" && q.includes(key.toLowerCase().slice(0, 25))
    );
    return match ? match[1] : DEMO_AI_CONTENT.chat.default;
};

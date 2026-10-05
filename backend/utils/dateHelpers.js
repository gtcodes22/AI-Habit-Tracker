import {
    format,
    subDays,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
} from "date-fns";

// Everything here works on "yyyy-MM-dd" date keys (strings), never Date
// objects, to stay consistent with how HabitLog.completedDate is stored.

export const toDateKey = (date) => format(date, "yyyy-MM-dd");

export const todayKey = () => toDateKey(new Date());

// The last n days, oldest first, ending on `end` (default: today).
export const lastNDays = (n, end = new Date()) => {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
        days.push(toDateKey(subDays(end, i)));
    }
    return days;
};

export const last90Days = (end = new Date()) => lastNDays(90, end);

// The 7 days of the current week, Monday through Sunday.
export const currentWeekKeys = (date = new Date()) => {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end }).map(toDateKey);
};

// Given a habit's completed-date keys (any order), return its current and
// longest streak. Mirrors the frontend mock's mockStreak() so behavior
// matches what the UI already expects.
export const calcStreak = (dateKeys) => {
    if (!dateKeys || dateKeys.length === 0) return { current: 0, longest: 0 };

    const set = new Set(dateKeys);
    const today = todayKey();
    const yesterday = toDateKey(subDays(new Date(), 1));

    // A streak is only "current" if today or yesterday is checked off —
    // otherwise it's broken, even if there's a long run further back.
    let current = 0;
    if (set.has(today) || set.has(yesterday)) {
        let cursor = set.has(today) ? new Date() : subDays(new Date(), 1);
        while (set.has(toDateKey(cursor))) {
            current += 1;
            cursor = subDays(cursor, 1);
        }
    }

    const sorted = [...set].sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const key of sorted) {
        if (prev) {
            const diffDays = Math.round(
                (new Date(key) - new Date(prev)) / (1000 * 60 * 60 * 24)
            );
            run = diffDays === 1 ? run + 1 : 1;
        } else {
            run = 1;
        }
        if (run > longest) longest = run;
        prev = key;
    }

    return { current, longest };
};

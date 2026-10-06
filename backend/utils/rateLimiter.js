// A small in-memory, rolling-window rate limiter for AI calls — protects a
// non-technical user from unexpected provider costs or rate-limit errors
// (Gemini's free tier is 5 requests/minute; similar caps apply elsewhere).
//
// Known limitation: this state lives in process memory, not the database.
// That's the correct scope for a single server process (what this app
// runs as), but it resets on restart and wouldn't coordinate across
// multiple server instances if this were ever horizontally scaled.

const WINDOW_MS = 60_000;

// key -> array of request timestamps (ms) within the last WINDOW_MS
const windows = new Map();

// Returns { allowed: true } and records the request, or
// { allowed: false, retryAfterSeconds } without recording it.
export const checkRateLimit = (key, limitPerMinute) => {
    const now = Date.now();
    const timestamps = (windows.get(key) || []).filter((t) => now - t < WINDOW_MS);

    if (timestamps.length >= limitPerMinute) {
        windows.set(key, timestamps); // keep the pruned array either way
        const oldest = timestamps[0];
        const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
        return { allowed: false, retryAfterSeconds };
    }

    timestamps.push(now);
    windows.set(key, timestamps);
    return { allowed: true };
};

// Periodic sweep so keys for since-deleted users or stale providers don't
// accumulate forever. Harmless to skip a cycle; this is just hygiene.
const SWEEP_MS = 5 * 60_000;
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of windows) {
        const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
        if (fresh.length === 0) windows.delete(key);
        else windows.set(key, fresh);
    }
}, SWEEP_MS).unref(); // unref: never keeps the process alive on its own

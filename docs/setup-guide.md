# Setup Guide

## Prerequisites

- Node.js (a current LTS or newer) and npm
- A MongoDB Atlas account (free tier is fine)
- A Google account for a Gemini API key

## 1. Frontend

```bash
cd frontend/ai-habit-tracker-ui-boilerplate-code
npm install
npm run dev          # http://localhost:5173
```

Other scripts: `npm run build`, `npm run lint`, `npm run preview`.

The frontend runs on its built-in **mock API** until it is switched to the real backend (see [Frontend Integration](frontend-integration.md)).

### Frontend environment

`frontend/.../.env` (git-ignored; copy from `.env.example`):

```
VITE_API_URL=http://localhost:8000/api
```

Vite bakes this in at startup: **restart the dev server after changing it.**

## 2. Backend

```bash
cd backend
npm install
```

Scripts (in `package.json`):

| Script | Command | Purpose |
|---|---|---|
| `npm start` | `node server.js` | Production start |
| `npm run dev` | `nodemon server.js` | Auto-restart on change |
| `npm run seed` | `node scripts/seed.js` | Populate demo data |

`server.js` and `scripts/seed.js` do not exist yet. See the [Development Roadmap](development-roadmap.md).

### Backend environment

Create `backend/.env` (git-ignored):

```
PORT=8000
MONGO_URI=<your Atlas connection string>
JWT_SECRET=<64-byte hex string>
JWT_EXPIRES_IN=30d
GEMINI_API_KEY=<your Google AI Studio key>
GEMINI_MODEL=gemini-3.8-flash
GEMINI_SHARED_KEY_ENABLED=false
AI_PROVIDER=gemini
AI_RATE_LIMIT_PER_MINUTE=5
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma2:9b
ANTHROPIC_MODEL=claude-sonnet-5
OPENAI_MODEL=gpt-5.4-mini
ENCRYPTION_KEY=<64-character hex string>
CLIENT_URL=http://localhost:5173
```

| Variable | Purpose |
|---|---|
| `PORT` | Port the API listens on (8000) |
| `MONGO_URI` | Atlas connection string (read by `config/db.js`) |
| `JWT_SECRET` | Signs auth tokens. Use a long random value. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `30d` (read by `authController.js`) |
| `GEMINI_API_KEY` | Your Gemini key. Only actually usable by anonymous/no-key users if `GEMINI_SHARED_KEY_ENABLED=true` — see below. Always usable by you, directly, for your own account by adding it as a personal key in Settings. |
| `GEMINI_MODEL` | Gemini model name. **`gemini-2.5-flash` no longer works for new API keys** — use `gemini-3.8-flash` or whatever Google currently recommends. |
| `GEMINI_SHARED_KEY_ENABLED` | **Default `false`.** While false, `GEMINI_API_KEY` is never used for anyone without their own personal key — no live call happens at all, no quota is spent, no cost is possible. Set to `true` only if you deliberately want visitors without their own key to use yours. See below. |
| `AI_PROVIDER` | Server-wide default: `gemini`, `ollama`, `claude` or `openai`. A signed-in user's own Settings choice always overrides this. |
| `AI_RATE_LIMIT_PER_MINUTE` | Default cap for the built-in AI rate limiter (see below). Users with their own key can raise/lower/disable this for themselves in Settings → Advanced; this value always governs the shared Gemini key regardless of any user's personal setting. |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Only used when the active provider is `ollama`; see below |
| `ANTHROPIC_MODEL`, `OPENAI_MODEL` | Default model for Claude/ChatGPT when a user hasn't set their own. There's no server-wide key for either — see below. |
| `ENCRYPTION_KEY` | Required before anyone can save a Gemini/Claude/ChatGPT key in Settings. See below. |
| `CLIENT_URL` | Allowed CORS origin(s); comma-separated for several |

> The variable name is `MONGO_URI`, matching `config/db.js`. `.env` must live in the **`backend/` root** (next to `server.js`), not in a subfolder: `dotenv` loads `.env` from the directory the server is started in, so a misplaced file is silently ignored.

### Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 3. MongoDB Atlas

1. Sign in at mongodb.com and create a **new project** (e.g. "AI Habit Tracker").
2. Create a **cluster** (free tier), choose a region near you, and give it a name.
3. Create a **database user** (username and password).
4. Under **Network Access**, allow your IP address. Connections fail otherwise.
5. Choose **Connect → Drivers** and copy the connection string.
6. Put your database user's password into the string and set it as `MONGO_URI`. If the password contains special characters, URL-encode them.

## 4. Gemini API key

1. Open **Google AI Studio** and sign in.
2. **Get API key → Create API key.**
3. Copy it into `GEMINI_API_KEY`.

## 5. Optional: local AI via Ollama

Set `AI_PROVIDER=ollama` to run the AI features against a local [Ollama](https://ollama.com) model instead of Gemini — no API key, no internet call, habit data never leaves the machine. Requires:

1. [Ollama](https://ollama.com) installed and running (`ollama serve`, or the desktop app).
2. A model pulled: `ollama pull gemma2:9b` (the project's default — see `OLLAMA_MODEL`).
3. `AI_PROVIDER=ollama` in `backend/.env`.

**If `gemma2:9b` fails to load** with an error like `failed to allocate buffer for kv cache` (out of memory), that's your machine's available RAM, not this backend. Either close other memory-heavy apps and retry, or switch to a smaller model — no code change needed, just update `OLLAMA_MODEL`:
```
OLLAMA_MODEL=mistral:latest
```

**If you pick a reasoning model** (e.g. `deepseek-r1` or `qwen3.5`), its chain-of-thought comes back separately from the final answer, so don't set `num_predict` too low in `options` — a small cap can truncate generation before the real answer ever appears.

No code change is needed to flip providers — `chatCompletion()` dispatches based on `AI_PROVIDER` alone, and every AI feature works unchanged either way.

**Per-user Ollama settings:** `OLLAMA_BASE_URL`/`OLLAMA_MODEL` above are only the *server's* defaults. Each user can also set their own Ollama server URL and model in **Settings** (no `.env` editing needed for this part) — useful if their Ollama install isn't on the same machine/port as the server default, or if different users on the same deployment run Ollama in different places. A blank value in Settings falls back to the server default. Note the address is resolved **from the backend server**, not the user's browser — `localhost` only works when Ollama and the backend are running on the same machine; pointing a remotely-hosted backend at a user's own laptop needs an address the server can actually reach (e.g. a LAN IP or a tunnel), not `localhost`.

## 6. Optional: Gemini, Claude or ChatGPT with your own key

Each user can paste their own Gemini, Anthropic or OpenAI key in **Settings** — no `.env` editing needed for this part. The one thing the *server* needs set up first is encryption:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Put the output in `ENCRYPTION_KEY`. This encrypts every user's saved key at rest (AES-256-GCM) — without it, nobody can save a key for any provider (the request fails with a clear `500`, not a silent plaintext save).

**Once `ENCRYPTION_KEY` is set:** open Settings in the app, pick a provider, paste a key (Settings links to where to get one for each), optionally click **Test connection**, and Save. From then on, that user's AI features run on their own key and billing — nothing else in `.env` needs to change. For Claude/ChatGPT this is required (neither has a server-wide fallback); for Gemini it's optional (see the next section).

**Losing or rotating `ENCRYPTION_KEY`** makes every already-saved key unreadable; everyone using BYOK would need to re-paste theirs. Keep it backed up somewhere safe, same as `JWT_SECRET`.

## 7. The shared Gemini key, and why it's off by default

`GEMINI_API_KEY` (if you set one) can act as a fallback for any signed-in user who hasn't added their own personal Gemini key — **but only if you explicitly set `GEMINI_SHARED_KEY_ENABLED=true`.** The default is `false`, meaning:

- No live request against your key happens for anyone who hasn't brought their own, under any circumstance.
- Those users see a plain "add your own key" message instead.
- Nothing about your own key's quota or cost is ever touched without you deliberately flipping that switch.

**Why default-off, and why BYOK is the real design, not a fallback:** a shared key is one fixed pool of capacity — splitting Gemini's free-tier 5 requests/minute across, say, 5 simultaneous users leaves each of them 1/minute, which doesn't scale with your user count, it works *against* it. BYOK is the only architecture where capacity grows with your users instead of shrinking per user, since everyone's quota is their own. The built-in rate limiter below exists to protect people using *their own* key from an accidental cost spike — it's not meant to make a shared key viable for real usage.

**If you do turn the shared key on** (e.g. briefly, for your own testing), the built-in rate limiter still applies — see the next section — and is scoped *globally* across everyone using the shared key, not per-user, so it can't be exceeded in aggregate no matter how many people are relying on it.

**The actual guarantee that the shared key can never cost real money** is simpler than any of this: don't attach a billing account to it at the Google Cloud/AI Studio level. A key with no payment method attached structurally cannot incur charges — exceeding the free tier just means requests get rejected. Treat `GEMINI_SHARED_KEY_ENABLED` as "don't even burn the free quota," not as financial protection by itself.

## 8. The built-in AI rate limiter

Every AI feature is capped by default at `AI_RATE_LIMIT_PER_MINUTE` (default `5`) requests per minute, to protect against an accidental cost spike or a free-tier provider's own rate-limit errors. This applies per-user to a personal key; a user can raise, lower (1–60) or disable it for *their own* key in **Settings → Advanced** (disabling requires checking "I understand the risk" each time). It does **not** apply to Ollama (free, local, no quota concern) or to the seeded demo account (see below, which never makes a live call at all).

A request that's throttled returns a clear message explaining why, rather than a generic error — the frontend's AI-calling components all surface this real message.

## 9. Verify

With the backend running:

- `GET http://localhost:8000/api/health` should return a status and timestamp.
- You should see "MongoDB connected" and "Server running on port 8000" in the terminal.

For API testing, use Thunder Client (VS Code), Postman or curl. See [API Reference](api-reference.md).

## Demo account

`npm run seed` (from `backend/`) populates a ready-made demo account: 7 habits with 90 days of realistic, varied history (around 440 logs), safe to re-run anytime to reset it back to this same state.

- **Email:** `demo@habittracker.local`
- **Password:** `Demo1234!`

Override either with `SEED_EMAIL` / `SEED_PASSWORD` environment variables if you'd rather not use the defaults. The script only ever touches this one account — it never affects any other user.

**This account's AI features are fully static** (`utils/demoAIContent.js`) — every one of the five AI endpoints returns realistic pre-written sample content instead of making a live call, so a visitor can explore the whole app, AI included, with zero API cost and no rate limit, regardless of `GEMINI_SHARED_KEY_ENABLED` or any provider configuration at all.

## Secrets checklist

- `backend/.gitignore` ignores `node_modules` and `.env`.
- `frontend/.../.gitignore` ignores `.env`; only `.env.example` is tracked.
- Never commit real keys. If one leaks, rotate it: create a new Gemini key, change the Atlas DB password, and generate a new `JWT_SECRET` (which logs everyone out).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Server exits immediately on start | Database connection failed: check `MONGO_URI`, Atlas IP allow-list, DB user password |
| `ERR_MODULE_NOT_FOUND` on start | An `import` path doesn't match a real filename (for example `errorMiddleware.js` vs `errorHandler.js`). ES modules require the exact name and the `.js` extension. |
| "MONGO_URI is not defined" | `.env` is missing, misplaced (must be in `backend/`, not `utils/`), or the variable is misspelled |
| Client shows `EPROTO … WRONG_VERSION_NUMBER` | The request URL starts with `https://`. The local server speaks plain HTTP: use `http://localhost:8000/...`. |
| `400` with `Unexpected token '"', ""{\r\n …" is not valid JSON` | The JSON body in your API client has a **syntax error**, most often **missing commas between properties** (every line except the last needs one). Thunder Client then sends the broken text as a quoted string. Fix the JSON so it is valid and starts with `{`. |
| Other `400` with `Expected property name or '}' in JSON …` | Same cause: invalid JSON in the request body (missing or trailing commas, unquoted keys, single quotes) |
| Frontend still shows mock data | `axios.js` not yet swapped, or `.env` changed without restarting Vite |
| Browser CORS error | `CLIENT_URL` doesn't include the frontend's origin |
| Redirected to `/login` after switching to the real API | Expected once: the old mock token is invalid. Register a fresh account. |
| AI features return "disabled" text | `GEMINI_API_KEY` missing/not loaded (Gemini), `AI_PROVIDER=ollama` with Ollama not running, or the user's provider is `claude`/`openai` with no key saved in Settings |
| Ollama model fails with "failed to allocate buffer for kv cache" | Out of memory for that model on this machine — not a backend bug. Close other apps, or switch `OLLAMA_MODEL` to a smaller model (e.g. `mistral:latest`) |
| An Ollama response seems to produce no visible answer | Likely a reasoning model (`deepseek-r1`, `qwen3.5`, etc.) whose chain-of-thought is burning the token budget before any final answer — raise or remove `num_predict`, don't cap it low |
| Saving a Gemini/Claude/ChatGPT key returns `500` | `ENCRYPTION_KEY` isn't set on the server — see [section 6](#6-optional-gemini-claude-or-chatgpt-with-your-own-key) |
| A fresh user gets "the app's shared Gemini key isn't available" | Expected: `GEMINI_SHARED_KEY_ENABLED` defaults to `false`. Either add a personal key in Settings, or the server owner sets it to `true` |
| AI requests return `429` | The built-in rate limiter (default 5/min) — see [section 8](#8-the-built-in-ai-rate-limiter). The response message explains exactly why and how to adjust it |
| "Test connection" fails for a Claude/ChatGPT key that looks right | The key itself is invalid/expired/wrong type, or lacks credit — the exact message from the provider's API is shown |
| `401` on protected routes | Missing or expired `Authorization: Bearer <token>` header |

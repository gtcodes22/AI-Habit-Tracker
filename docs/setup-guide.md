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
AI_PROVIDER=gemini
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma2:9b
CLIENT_URL=http://localhost:5173
```

| Variable | Purpose |
|---|---|
| `PORT` | Port the API listens on (8000) |
| `MONGO_URI` | Atlas connection string (read by `config/db.js`) |
| `JWT_SECRET` | Signs auth tokens. Use a long random value. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `30d` (read by `authController.js`) |
| `GEMINI_API_KEY` | Enables AI features via Gemini. Optional: without it (and with `AI_PROVIDER=gemini`), AI endpoints return a placeholder. |
| `GEMINI_MODEL` | Gemini model name. **`gemini-2.5-flash` no longer works for new API keys** — use `gemini-3.8-flash` or whatever Google currently recommends. |
| `AI_PROVIDER` | `gemini` (default) or `ollama` — see below |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Only used when `AI_PROVIDER=ollama`; see below |
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

## 6. Verify

With the backend running:

- `GET http://localhost:8000/api/health` should return a status and timestamp.
- You should see "MongoDB connected" and "Server running on port 8000" in the terminal.

For API testing, use Thunder Client (VS Code), Postman or curl. See [API Reference](api-reference.md).

## Demo account

`npm run seed` (from `backend/`) populates a ready-made demo account: 7 habits with 90 days of realistic, varied history (around 440 logs), safe to re-run anytime to reset it back to this same state.

- **Email:** `demo@habittracker.local`
- **Password:** `Demo1234!`

Override either with `SEED_EMAIL` / `SEED_PASSWORD` environment variables if you'd rather not use the defaults. The script only ever touches this one account — it never affects any other user.

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
| AI features return "disabled" text | `GEMINI_API_KEY` is missing or not loaded (Gemini provider), or `AI_PROVIDER=ollama` with Ollama not running |
| Ollama model fails with "failed to allocate buffer for kv cache" | Out of memory for that model on this machine — not a backend bug. Close other apps, or switch `OLLAMA_MODEL` to a smaller model (e.g. `mistral:latest`) |
| An Ollama response seems to produce no visible answer | Likely a reasoning model (`deepseek-r1`, `qwen3.5`, etc.) whose chain-of-thought is burning the token budget before any final answer — raise or remove `num_predict`, don't cap it low |
| `401` on protected routes | Missing or expired `Authorization: Bearer <token>` header |

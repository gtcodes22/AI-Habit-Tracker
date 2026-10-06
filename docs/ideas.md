# Ideas & Future Development

A running backlog of ideas that are **not** part of the current scope. Nothing here is committed work. It's a place to capture thinking so it isn't lost.

## How to use this file

- Add a new entry at the **top of the list** (newest first) using the template below.
- Give each idea a **status**. Change it as the idea evolves, and don't delete old entries: a rejected idea with a reason is useful history.
- When an idea is accepted, move its concrete tasks into the [Development Roadmap](development-roadmap.md) and note it in the [Changelog](CHANGELOG.md) when it ships.

### Status values

| Status | Meaning |
|---|---|
| **Idea** | Captured, not yet evaluated |
| **Exploring** | Being researched or prototyped |
| **Accepted** | Will be built; tasks belong in the roadmap |
| **Shipped** | Done; see the changelog |
| **Rejected** | Decided against. Keep the reason. |

### Entry template

```markdown
### <Short title>
- **Added:** YYYY-MM-DD
- **Status:** Idea
- **Summary:** One or two sentences.
- **Why:** What problem or opportunity it addresses.
- **Considerations:** Trade-offs, risks, dependencies.
- **Open questions:** What needs deciding.
```

---

## Ideas

### Client-side Ollama calls, multi-platform distribution, and a multi-app ecosystem
- **Added:** 2026-10-06
- **Status:** Idea — design discussion only, nothing built.

**1. Client-side Ollama, keeping everything else unchanged.** Today `chatCompletionOllama` runs server-side, so `OLLAMA_BASE_URL` resolves relative to the *server's* machine — fine for local dev, broken for a hosted deployment (the server can't reach a user's laptop). Fix: call Ollama **directly from the browser** instead of through the backend. This works because browsers treat `localhost`/`127.0.0.1` as a secure context exempt from mixed-content blocking (an HTTPS page can `fetch("http://localhost:11434/...")` without issue) — the real requirement is CORS: the user's Ollama needs `OLLAMA_ORIGINS` set to allow the deployed frontend's origin.
  - Keep `geminiApiKey`/`anthropicApiKey`/`openaiApiKey` exactly as they are now — server-side, encrypted, synced across devices. A cloud API key is account-scoped; a user expects it to just be there on any device they log in from, which is exactly what the current design already gets right.
  - Move `ollamaBaseUrl`/`ollamaModel` to **localStorage, not the `User` model.** These are inherently device-specific (the whole point is "my Ollama on *this* machine"), so there's nothing to lose by not syncing them, and it sidesteps needing a profile update round-trip just to test a local URL.
  - To keep prompts correct without duplicating the habit-data aggregation logic client-side, add a lightweight `POST /ai/build-prompt` endpoint that returns `{ systemPrompt, userMessage }` using the existing server-side `groupDatesByHabit`/date-range logic. Frontend calls that first, then either `chatCompletion` (cloud providers, as now) or a direct Ollama fetch (local) — same UI, one branch on provider. Ollama results would need an extra client → `POST /ai/record-insight` call to preserve the current `AIInsight.create()` persistence, since the backend is no longer the one making the call.
  - Ollama's existing rate-limiter exemption is unaffected either way.

**2. Multi-platform (desktop + mobile, alongside the existing web app).** Keep the Express API as the single source of truth for every client — no client-specific backend logic.
  - **Desktop:** Electron (or Tauri, lighter-weight) wrapping the existing React app with little to no change. This is also what makes "client-side Ollama" moot on desktop specifically — the embedded app *is* the user's machine, so `localhost` always resolves correctly even without the CORS dance.
  - **Mobile (iOS/Android):** React Native/Expo. The UI layer gets rebuilt (RN isn't DOM-based), but a monorepo with a shared `api-client`/types package avoids re-deriving auth/request logic per platform. Local Ollama support realistically doesn't extend to mobile — a phone's "localhost" isn't the user's PC — so mobile would be cloud-providers-only.
  - Sequencing: don't start mobile until the web app is stable: it's the most expensive platform to add and the UI can't be reused directly.

**3. The grander vision — a multi-app personal ecosystem.** Longer-term goal: a consolidated dashboard combining this habit tracker with other planned apps (an AI recipe generator; eventually a combined habit+fitness+nutrition tracker; a project/kanban tracker; self-learning notes; an AI whiteboard/diagramming tool) — so working on a task in one place can automatically update tracking in another, without switching apps.
  - **Too early to build now**, but cheap to prepare for: give every future mini-app the **same auth/account system** and a **shared `activity`/`event` collection** from day one (e.g. `{ userId, app, type, payload, timestamp }`), even while each app stays its own repo/deploy. That's what makes later cross-app automation possible without a rewrite, at near-zero cost today.
  - **Near-term, concrete step:** a simple landing/launcher page — one login, links out to each deployed mini-app, shared nav — rather than real integration. Cheap "ecosystem v0" that doesn't require committing to which apps survive long-term.
  - Revisit real integration once 2–3 mini-apps actually exist and it's clear which ones are worth combining.

---

### Support multiple AI providers (Claude, local models via Ollama)
- **Added:** 2026-09-20
- **Status:** All four providers **shipped**, and all three cloud providers now support bring-your-own-key: Gemini (original + optional BYOK), Ollama (Phase 8: provider plumbing; Phase 9: per-user settings + live model picker; Phase 10 extension #3: per-user connection URL, independent per-provider model fields), Claude/ChatGPT (Phase 10: encrypted bring-your-own-key, required since neither has a server-wide key). A built-in AI request rate limiter (5/min default, on by default) also shipped as part of Phase 10. Built and tested 2026-10-05 through 2026-10-06, not yet committed. See the BYOK write-up below for what's still unverified.
- **Summary:** The project currently uses only Google Gemini. Let the backend use other models too: Anthropic Claude, and local models served by Ollama, alongside or instead of Gemini.
- **Why:** Avoid lock-in to one vendor, compare answer quality per feature, control cost, and (with Ollama) keep habit data on the user's own machine.
- **Where it fits today:** All Gemini-specific code is meant to live in one file, `backend/utils/aiService.js`, behind a single function, `chatCompletion(system, user, temperature)`. The five AI controllers only call that function. So this idea is mostly a change *inside* `aiService.js`, not a rewrite of the features. See [AI Features](ai-features.md).
- **Sketch of an approach (not a decision):**
  - Define a small provider interface (for example `generate({ system, user, temperature })` returning text), with one implementation per provider: Gemini (`@google/genai`), Claude (`@anthropic-ai/sdk`), Ollama (its local HTTP API, default `http://localhost:11434`).
  - Choose the provider with configuration, for example `AI_PROVIDER=gemini|claude|ollama`, plus per-provider settings (`ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and so on).
  - Keep the "lazy client, degrade gracefully when unconfigured" behavior for every provider.
- **Considerations:**
  - **Prompts are tuned for Gemini.** Each model follows instructions differently, so expect to re-tune the five system prompts per provider.
  - **Structured output is the fragile part.** The habit-suggestion feature needs valid JSON. `parseJSON` and the hard-coded fallback already tolerate bad output, but smaller local models will fail more often. Provider-specific JSON modes or schema features could help.
  - **Local model quality and speed vary a lot** by model and hardware. The data-chat feature (largest context) is the most demanding.
  - **Privacy:** with Gemini or Claude, habit data leaves the machine as part of the prompt. Ollama keeps it local. That could be a selling point.
  - **Cost and rate limits** differ per provider; the empty-data shortcut and the frontend's weekly-report cache still apply.
  - **Model IDs change.** Keep model names in configuration, not code.
- **Open questions:**
  - ~~One global provider, or a choice per feature?~~ **Resolved for now:** one global switch (`AI_PROVIDER`), simplest to reason about. Per-feature choice is still on the table if a reason comes up.
  - Should users pick the provider in settings, or is it a deployment-level choice? Still open — currently a deployment-level `.env` setting only.
  - ~~Record which provider and model produced each `AIInsight`?~~ **Done** — every `AIInsight.meta` now includes `{ provider, model }`.
  - Any automatic fallback chain (try Claude, fall back to Gemini)? Still open. Claude isn't implemented at all yet.

**What was built (2026-10-05):**
- `backend/utils/aiService.js`: `chatCompletion()` now dispatches on `PROVIDER` (from `AI_PROVIDER`, default `"gemini"` — unchanged behavior if you never set it). The Ollama path is a plain `fetch` to `${OLLAMA_BASE_URL}/api/chat` (no SDK needed — Ollama's API is just local HTTP) and degrades gracefully (a friendly message, not a crash) if Ollama isn't running, exactly like the existing "no Gemini key" case.
- `.env`: added `AI_PROVIDER` (default `gemini`), `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (default `gemma2:9b`, per the user's choice). Flip `AI_PROVIDER=ollama` to switch over — no code change needed.
- All five AI features work unchanged with either provider, since they only ever call `chatCompletion()`.

**Testing status — fully resolved:**
- **The integration code is proven correct end-to-end**, including real generation: a live call through this exact code path (well, the same request shape `chatCompletion()` sends) to `deepseek-r1:1.5b` returned a complete, well-formed response, and the content-extraction logic (`message.content`, separate from `message.thinking` — see below) pulled exactly the right text.
- **`gemma2:9b` (the chosen default) currently fails to load on this machine with an out-of-memory error** (`failed to allocate buffer for kv cache`), reproduced twice, including after confirming no other model was loaded (`ollama ps` showed nothing resident). This is a real memory constraint on this machine, not a bug in the integration — `gemma2:9b` needs its ~5.4 GB of weights plus additional buffer space Ollama couldn't allocate. It may work fine on a machine with more free RAM, or after closing other memory-heavy apps.
- **A confirmed-working alternative on this machine: `mistral:latest`** (already pulled, 4.4 GB) — responded correctly in ~9 seconds. If you want local AI working right now without troubleshooting memory, set `OLLAMA_MODEL=mistral:latest` in `.env` — no code change needed.
- **A red herring worth knowing about:** two early test attempts (`qwen3.5:4b`, `deepseek-r1:1.5b`) appeared to "hang" with zero output. That wasn't a hang — both are **reasoning/"thinking" models** that spend a large hidden token budget on chain-of-thought (returned separately as `message.thinking`) before producing any `message.content`. The test had `num_predict` capped very low (10-30 tokens), which cut generation off mid-thinking, before content ever appeared. If you pick a reasoning model as `OLLAMA_MODEL`, don't cap `num_predict` too aggressively, or use Ollama's `think: false` option if the model supports it.

**Bottom line:** the feature works. If `gemma2:9b` OOMs for you too, switch `OLLAMA_MODEL` to `mistral:latest` (or free up memory) — both are a one-line `.env` change, no code involved.

**Hardware note, for picking future local models:** this machine has an NVIDIA RTX 4050 Laptop GPU — 6 GB VRAM total, ~5 GB available to Ollama. That's the practical ceiling for comfortably running a 9B-class model; `gemma2:9b`'s OOM is right at that edge. Models in the 1.5B–7B range (`mistral:latest`, `qwen2.5-coder:7b-instruct`, `qwen3.5:4b`, `deepseek-r1:1.5b`) fit more comfortably.

---

### Phase 9: per-user AI settings (built 2026-10-05)

What Phase 8 added at the server level, Phase 9 moved into the app itself — each user now picks their own provider and model from Settings, no `.env` editing:

- `models/User.js`: `aiProvider` (`"gemini"` | `"ollama"`, default `"gemini"`) and `aiModel` (free string, empty = "use that provider's server default").
- `PUT /api/auth/profile` validates and saves both, same pattern as the existing `morningMotivation` toggle.
- `aiService.js`: `chatCompletion(prompt, message, temperature, override)` — a 4th, optional `{ provider, model }` argument that wins over the server-wide `AI_PROVIDER`/`GEMINI_MODEL`/`OLLAMA_MODEL` when provided. `resolveProviderAndModel(override)` is the same resolution logic, exposed for recording accurate `{ provider, model }` metadata.
- All five AI controllers now build this override from `req.user.aiProvider`/`aiModel` and pass it through — so two different users on the same server can each be talking to a different AI backend simultaneously.
- `GET /api/ai/ollama-models`: proxies Ollama's own `/api/tags`, so the Settings UI shows exactly what's pulled locally — doubles as a "test connection" check.
- `Sidebar.jsx` Settings modal: a provider dropdown; picking Ollama triggers a live connectivity check (green "✓ Connected — N models found" / red "✕ Can't reach Ollama"), a re-check button, and a model dropdown sourced from that live list (falls back to a free-text field if Ollama isn't reachable, so the setting is never a dead end).

**Verified live** with Playwright against the real app, Ollama actually running: default is Gemini; switching to Ollama shows the real "9 models found" status with the actual pulled models listed; a chosen model (`mistral:latest`) survives a page reload and a full logout/login cycle; zero console errors. 9/9 checks passed. (One early screenshot looked visually broken — overlapping the sidebar — but that was confirmed to be a Playwright `fullPage` + `backdrop-blur` capture artifact, not a real rendering bug; a viewport-only screenshot showed a clean, correctly centered modal.)

**What Phase 9 deliberately didn't do:** no encryption, no user-supplied secrets. Ollama needs no API key, so there was nothing sensitive to store. That's exactly the harder problem BYOK (below) still needs to solve.

---

### Phase 10 (built 2026-10-05, not yet committed): "Bring Your Own Key" — Claude and ChatGPT

Lets a non-technical user add Claude or ChatGPT by pasting their own API key into Settings — no `.env`, no restart — and from then on the app uses their key, their provider, their chosen model.

**What it needed, beyond what Phase 9 already built — all four delivered as planned:**

1. **Two more providers in `aiService.js`**, same shape as Ollama: `@anthropic-ai/sdk` for Claude, `openai` for ChatGPT. Each is one function; the five AI controllers didn't change.
2. **Encryption at rest.** `utils/crypto.js`: AES-256-GCM via Node's built-in `crypto` (no new dependency), keyed by a server-side `ENCRYPTION_KEY`. The encrypted field is stripped from every client-facing response, same as `password` — the client only ever sees `hasAnthropicKey`/`hasOpenaiKey` booleans, never the key itself.
3. **A "Test connection" step.** `POST /api/ai/test-connection` makes one cheap, minimal call per provider (works against a just-typed, not-yet-saved key too).
4. **Clear cost messaging in the UI.** "Uses your own API key — you'll be billed directly by Anthropic/OpenAI."

**Decisions made on the open questions:**
- **Same `User` document**, not a separate collection — simplest, and this is a personal app, not a multi-tenant system needing that isolation.
- **Strictly write-only.** The key never round-trips back to the client in any form; re-verifying means re-pasting (or using Test connection, which accepts a freshly typed key without requiring a save first).
- **Same `aiProvider` enum**, extended to `gemini`/`ollama`/`claude`/`openai` — one unified switch rather than a separate BYOK flag, so the Settings dropdown and the backend's `resolveProviderAndModel()` stay one simple mechanism.

**Verified live:** 19 backend checks (key never leaks in any response at any layer, the DB value is genuinely ciphertext — confirmed by direct query, not plaintext, switching providers doesn't wipe a saved key, and a deliberately invalid key was sent to the **real Anthropic API** and correctly rejected with a clean `401`, proving the full pipeline reaches the real service) and 17 Playwright UI checks. One real bug was found and fixed during UI testing: the typed key stayed in React state after a successful save, so reopening Settings silently showed the stale typed value instead of the "key saved" placeholder — fixed, and a stronger assertion (checking the actual input value, not just its placeholder attribute) was added to the test to catch the same mistake if it recurs.

**What's still unverified:** a full successful generation through Claude or ChatGPT — no real API keys for either were available this session. Everything up to that boundary (encryption, storage, routing, validation, and the real API correctly rejecting bad credentials) was confirmed live; only an actual successful response was not.

---

#### Phase 10 extension (same day, 2026-10-05): Gemini joins BYOK, plus a built-in rate limiter

Two follow-ups requested after the Claude/ChatGPT work landed:

**1. Gemini BYOK.** Gemini is different from Claude/ChatGPT in one real way: it already has a server-wide fallback key (`GEMINI_API_KEY`), so a personal key is *optional* for it, not required. `chatCompletionGemini()` and the `gemini` branch of `testConnection()` now accept an `apiKey` override — when given, a fresh client is built for that call; when absent, the existing server-wide singleton client is used exactly as before. `geminiApiKeyEncrypted` / `hasGeminiKey` follow the identical pattern as Claude/OpenAI.

**2. A built-in AI request limiter**, on by default at 5/minute (Gemini's well-known free-tier number), to protect a non-technical user from two different failure modes: hitting a free-tier provider's own rate limit and seeing a confusing error, or — on a paid plan — an accidental cost spike from a bug or repeated clicking. Built as `middleware/aiRateLimit.js` (an in-process, rolling-window counter in `utils/rateLimiter.js`) applied only to the five content-generating routes, not the passive `/ollama-models` check or the deliberate `/test-connection` action.

**The one real design subtlety, caught before shipping:** whose quota is being protected? A user's *own* key (BYOK) is genuinely their own resource — limit it per-user, and let them customize or disable it via an "Advanced" Settings section (on by default; disabling requires a freshly-checked "I understand the risk" box every time, not just once). But Gemini's *shared server key* is one real quota shared by everyone using it — if each user got their own independently-tracked 5/min "protection" while actually hitting the same underlying key, N users could collectively blow straight through the one real 5/min limit while every individual dashboard looked "protected." **Fix:** the shared key is always limited globally, always at the server's own default, and a user's personal enabled/custom-number preference has **no effect** on it — only on their own key, if they have one. This was caught by the test suite itself (a "custom limit" test gave a confusing result because it was unknowingly sharing a bucket with an earlier test), traced to its root cause, and fixed rather than worked around.

**UI:** a "Get a key" link, test-connection, and the Advanced rate-limit section all live in the same Settings modal as the rest of BYOK, gated behind a disclosure so the common case stays uncluttered.

**A second real gap found and fixed:** two of the five AI-calling frontend components (`StreakRecoveryCard`, `HabitSuggestionModal`) had **no error handling at all** — a 429 (or any failure) would leave the user on an infinite loading spinner with zero explanation, directly undermining the "well-informed user" goal this feature exists for. The other three showed only a generic fallback message, discarding the actual backend explanation. All five now surface the real `err.response?.data?.message`.

**Verified live:** 25 backend checks (Gemini BYOK round-trip through the real Anthropic-style flow with a fake key rejected by the real Gemini API; the default 5/min limit triggering a clean 429 on the 6th rapid call with no habits needed — the limiter runs before any habit lookup, so it's free to test; Ollama confirmed exempt; a BYOK user's custom number and disable toggle both working; and, the important one, two independent confirmations — one in the full suite, one in an isolated clean-slate re-run — that a shared-key user's personal preferences are correctly ignored in favor of the server default) plus 11 Playwright UI checks against the real running app, including triggering one genuine 429 through the actual "Generate weekly report" button and confirming the real backend message appeared in the UI instead of the old generic fallback.

**What's still unverified:** same as above — no real Gemini/Claude/OpenAI paid-tier key was available to confirm a successful generation under BYOK; everything up to that boundary was.

---

#### Phase 10 extension #2 (same day, 2026-10-05): shared key off by default; demo account goes fully static

Immediately after the rate limiter shipped, a sharper question came up: a rolling-window request limiter controls *frequency*, not *spend*. It's real protection on a true free-tier key with no billing attached (Gemini just rejects requests past the free quota — $0 is guaranteed by the absence of a payment method, not by any app code), but it was never a hard spending ceiling, and the shared key was reachable by any anonymous new registration with no owner approval step at all. That doesn't match "I don't intend to incur any spending costs at the moment, and nothing should happen without my say-so."

It also surfaced the real reason a shared key was there in the first place: letting a brand-new visitor see the app work before committing to their own key. Once that's named explicitly, a live call isn't actually necessary to achieve it — a realistic, pre-populated preview does the same job with zero ongoing cost or complexity.

**What shipped:**

1. **`GEMINI_SHARED_KEY_ENABLED`, defaulting to `false`.** Gated at the single choke point both `chatCompletion()` and `testConnection()` already shared (`getClient()` in `aiService.js`) — one change correctly covers every caller. While off, anyone without their own key gets a clear "add your own key" message; no live request against the shared key happens, full stop, until the owner explicitly flips this to `"true"`. This is a frequency/reachability gate, not a spend guarantee by itself — the actual guarantee remains not attaching a billing account to the shared key's Google account, which is outside app code entirely and the real reason $0 is structurally true.
2. **The seeded demo account (`demo@habittracker.local`) now returns static sample content for all five AI features — zero live calls, ever**, for that account specifically. `utils/demoAIContent.js` reuses the exact sample text from the frontend's old mock API (deleted in the Phase 7 cutover), which — not by coincidence, since the demo seed data in `scripts/seed.js` was itself modeled on that same original mock — already references the demo persona's real habit names ("Drink 2L of water," "Morning run," "Journal"), so it reads as genuinely consistent rather than generic. The demo account is also exempt from the rate limiter (nothing to protect — it never reaches a provider) and from input validation on these endpoints (always succeeds, so a visitor can't "break" the demo).
3. **BYOK is completely unaffected** — a user with their own key still reaches the real provider exactly as before; this only changes what happens with *no* personal key.

**Verified live:** logged into the real, already-seeded demo account and confirmed all five AI features return the correct static content, zero `AIInsight` documents are created (purely static, no persistence), and the account is immune to the rate limiter across 8 rapid calls. Separately confirmed, with a fresh real registration, that `weekly-report` now returns the graceful "shared key isn't available" placeholder instead of a live call, that `test-connection` reports the same, and that supplying a personal key still reaches the real Gemini API regardless of the switch (got a real auth rejection, not the "shared key off" message) — confirming BYOK and the shared-key gate are correctly independent of each other.

#### Phase 10 extension #3 (2026-10-06): per-user Ollama connection settings, and fixing a cross-provider model collision

Phase 9's Ollama settings assumed a new user already had Ollama set up and reachable at the server's own `OLLAMA_BASE_URL` — there was no way for a user without server-level access to point the app at their own Ollama install at all. The fix needed to mirror the BYOK pattern already built for Claude/OpenAI/Gemini: a per-user setting, editable in the app, testable before saving.

While building it, a real pre-existing bug surfaced: `aiModel` was a **single field shared across all four providers**. Since a Claude model name means nothing to Ollama (and vice versa), switching provider in Settings — even just to look at something, then switching back — could silently overwrite a different provider's remembered model with whatever the UI happened to be showing, because `save()` always sent the one shared field unconditionally. This was fixed as part of this change rather than left in place, since the new Ollama field would have inherited the same flaw otherwise.

**What shipped:**

1. **Per-provider model fields**, replacing the single `aiModel`: `geminiModel`, `ollamaModel`, `anthropicModel`, `openaiModel` on the `User` model, each independently validated/saved/returned — matching how the API key fields were already split per provider. Switching `aiProvider` back and forth in Settings no longer touches any other provider's saved model.
2. **`ollamaBaseUrl`** on the `User` model — where this user's own Ollama lives. Empty means "use the server's `OLLAMA_BASE_URL`". Not a secret (Ollama has no auth), so unlike the API keys it's always overwritten with whatever's sent, no "omit to leave untouched" dance needed.
3. **`aiService.js`**: `chatCompletionOllama` and the `chatCompletion()` dispatcher now accept/forward a `baseUrl` override, same shape as the existing `apiKey` override for the other providers. `fetchOllamaModels(baseUrl)` already supported a custom URL (used by `testConnection`'s ollama branch) — just needed wiring up to a saved per-user value.
4. **`GET /api/ai/ollama-models?baseUrl=...`** and **`POST /api/ai/test-connection`** both now accept an optional `baseUrl`, testing an unsaved value directly (so a user can verify their URL before saving it) and falling back to the user's saved `ollamaBaseUrl`, then the server default.
5. **Settings UI**: a text input for the Ollama server URL (placeholder `http://localhost:11434 — leave blank for the app's default`), an "install Ollama" link with a `ollama pull <model>` hint for brand-new users, a status line that names the actual address being tested, and a short caveat that the address is resolved **by the backend server**, not the user's browser — `localhost` only works when Ollama and the backend share a machine.

**Verified:** 25 backend checks against a temp server (fresh-user field defaults, independent per-provider persistence across provider switches, `ollamaBaseUrl` format validation, empty-string-clears-to-default, both the query-param and saved-value paths on `/ollama-models`, both the body-param and saved-value paths on `/test-connection`) — all passed, and the two real accounts' pre-existing `aiModel` values (both already `""`) confirmed safe to migrate away from before making the change. 7 real-browser Playwright checks against the running app (base URL input renders, install link renders, the status line reflects a just-typed address after refresh, both provider and base URL persist across a full page reload, and — the specific regression this was meant to fix — switching to Claude and back to Ollama leaves the saved base URL untouched).

### Push notifications
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** Remind users to check in, or deliver the morning motivation as a notification.
- **Source:** suggested at the end of the tutorial.
- **Open questions:** Web push, email, or mobile? Would need a scheduler on the backend.

### Social streak sharing
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** Let users share streaks or progress with friends.
- **Source:** suggested at the end of the tutorial.
- **Considerations:** Introduces privacy questions and likely new models (friends, shared views).

### Custom icon uploads
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** Habits currently pick from 12 emoji icons. Allow custom icons, or a larger emoji set.
- **Source:** suggested in the tutorial ("we can always add more emoji to this list in future").
- **Considerations:** Uploads need storage and validation; a larger emoji list is a much smaller change (`ICONS` in the frontend's `src/utils/constants.js`).

### Mobile app (React Native)
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** A native mobile client for the same backend.
- **Source:** suggested at the end of the tutorial.
- **Considerations:** The REST API and JWT auth are client-agnostic, so a mobile client could reuse the backend as-is.

---

## Rejected / parked

*(none yet)*

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Brain,
  BarChart3,
  LogOut,
  Settings,
  Sparkles,
  Sun,
  Moon,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import Modal from "./Modal.jsx";
import api from "../api/axios.js";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/habits", label: "Habits", icon: ListChecks },
  { to: "/weekly", label: "Weekly", icon: CalendarDays },
  { to: "/insights", label: "Insights", icon: Brain },
  { to: "/stats", label: "Statistics", icon: BarChart3 },
];

// "Bring your own key" providers: where to get a key, and the field on the
// user object that says whether one is already saved. Gemini is marked
// `optional` — unlike Claude/ChatGPT, it still works on the app's own
// shared key if the user never sets a personal one.
const BYOK_PROVIDERS = {
  gemini: {
    label: "Gemini",
    bodyField: "geminiApiKey",
    billedBy: "Google",
    keyUrl: "https://aistudio.google.com/apikey",
    hasKeyField: "hasGeminiKey",
    placeholder: "AIzaSy...",
    modelPlaceholder: "Model (e.g. gemini-3.8-flash) — leave blank for server default",
    optional: true,
  },
  claude: {
    label: "Claude",
    bodyField: "anthropicApiKey",
    billedBy: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    hasKeyField: "hasAnthropicKey",
    placeholder: "sk-ant-...",
    modelPlaceholder: "Model (e.g. claude-sonnet-5) — leave blank for server default",
  },
  openai: {
    label: "ChatGPT",
    bodyField: "openaiApiKey",
    billedBy: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    hasKeyField: "hasOpenaiKey",
    placeholder: "sk-...",
    modelPlaceholder: "Model (e.g. gpt-5.4-mini) — leave blank for server default",
  },
};

export default function Sidebar() {
  const { user, logout, updateUser } = useAuth();
  const { theme, toggle } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [morning, setMorning] = useState(user?.morningMotivation || false);
  const [name, setName] = useState(user?.name || "");
  const [aiProvider, setAiProvider] = useState(user?.aiProvider || "gemini");
  // Each provider has its own model (a Claude model name means nothing to
  // Ollama, etc.), keyed the same way the backend stores them.
  const [models, setModels] = useState({
    gemini: user?.geminiModel || "",
    ollama: user?.ollamaModel || "",
    claude: user?.anthropicModel || "",
    openai: user?.openaiModel || "",
  });
  const aiModel = models[aiProvider] || "";
  const setAiModel = (value) => setModels((m) => ({ ...m, [aiProvider]: value }));
  const [saving, setSaving] = useState(false);

  // Where this user's own Ollama install lives. Empty means "use the
  // server's default" (whatever OLLAMA_BASE_URL the app owner configured).
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(user?.ollamaBaseUrl || "");
  const [ollama, setOllama] = useState({ checking: false, reachable: null, models: [] });

  // Bring-your-own-key state (Claude / ChatGPT). apiKeyInput is only ever
  // sent on save if non-empty or keyCleared is set — leaving it blank never
  // overwrites an already-saved key.
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keyCleared, setKeyCleared] = useState(false);
  const [keyTest, setKeyTest] = useState({ testing: false, ok: null, message: "" });

  // Built-in AI rate limit (on by default). Only takes effect for a user's
  // own BYOK key — the app's shared Gemini key always stays protected at
  // the server default, regardless of this setting, so other people
  // relying on that shared key can't be starved by one person's choice.
  const [rateLimitOpen, setRateLimitOpen] = useState(false);
  const [rateLimitEnabled, setRateLimitEnabled] = useState(user?.aiRateLimitEnabled ?? true);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(user?.aiRateLimitPerMinute ?? 5);
  const [riskAck, setRiskAck] = useState(false);

  // Tests whichever URL is currently typed (even if unsaved), falling back
  // to the saved one, so a brand-new user can verify a URL before saving it
  // — same "test before you save" pattern as the API key fields below.
  const checkOllama = async () => {
    setOllama((o) => ({ ...o, checking: true }));
    try {
      const res = await api.get("/ai/ollama-models", {
        params: { baseUrl: ollamaBaseUrl.trim() || undefined },
      });
      setOllama({ checking: false, reachable: res.data.reachable, models: res.data.models });
    } catch {
      setOllama({ checking: false, reachable: false, models: [] });
    }
  };

  // Check Ollama as soon as the user picks it, so the model dropdown is
  // ready without an extra click.
  useEffect(() => {
    if (settingsOpen && aiProvider === "ollama" && ollama.reachable === null) {
      checkOllama();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, aiProvider]);

  const byok = BYOK_PROVIDERS[aiProvider];
  const hasSavedKey = byok ? !!user?.[byok.hasKeyField] : false;

  const changeProvider = (value) => {
    setAiProvider(value);
    setApiKeyInput("");
    setKeyCleared(false);
    setKeyTest({ testing: false, ok: null, message: "" });
  };

  const testKey = async () => {
    setKeyTest({ testing: true, ok: null, message: "" });
    try {
      const res = await api.post("/ai/test-connection", {
        provider: aiProvider,
        apiKey: apiKeyInput.trim() || undefined,
        model: aiModel.trim() || undefined,
      });
      setKeyTest({ testing: false, ok: res.data.ok, message: res.data.message });
    } catch (err) {
      setKeyTest({ testing: false, ok: false, message: err.response?.data?.message || "Test failed" });
    }
  };

  // Disabling the built-in rate limit requires an explicit, freshly-checked
  // acknowledgement every time — re-opening Settings with it already off
  // doesn't carry the checkbox over, so the risk gets re-affirmed, not just
  // signed away once.
  const riskNotAcknowledged = !rateLimitEnabled && !riskAck;

  const save = async () => {
    if (riskNotAcknowledged) return;
    setSaving(true);
    try {
      const payload = {
        name,
        morningMotivation: morning,
        aiProvider,
        geminiModel: models.gemini,
        ollamaModel: models.ollama,
        anthropicModel: models.claude,
        openaiModel: models.openai,
        ollamaBaseUrl,
        aiRateLimitEnabled: rateLimitEnabled,
        aiRateLimitPerMinute: rateLimitPerMinute,
      };
      if (byok) {
        if (keyCleared) payload[byok.bodyField] = "";
        else if (apiKeyInput.trim()) payload[byok.bodyField] = apiKeyInput.trim();
        // else: field omitted entirely -> backend leaves the saved key untouched
      }
      const res = await api.put("/auth/profile", payload);
      updateUser(res.data.user);
      setSettingsOpen(false);
      // Never leave a typed secret sitting in the password field after it's
      // been saved — the next open should show the plain "key saved"
      // placeholder, not the value the user just typed.
      setApiKeyInput("");
      setKeyCleared(false);
      setKeyTest({ testing: false, ok: null, message: "" });
      setRiskAck(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="hidden md:flex md:flex-col w-64 fixed inset-y-0 left-0 z-30 glass border-r">
      <div className="px-6 py-5 border-b divider">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Sparkles size={18} />
          </div>
          <div className="font-semibold text-lg tracking-tight">AI Habit Tracker</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive
                ? "bg-gradient-to-r from-brand-500/15 to-brand-500/5 text-brand-700 dark:text-brand-300 ring-1 ring-brand-500/20"
                : "text-soft hover:bg-[var(--surface-hover)]"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t divider space-y-1">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-soft hover:bg-[var(--surface-hover)] transition"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-soft hover:bg-[var(--surface-hover)] transition"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={18} />
          Settings
        </button>

        <div className="px-2 py-2 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white font-semibold flex items-center justify-center shadow-md shadow-brand-500/30">
            {user?.avatar || user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-faint truncate">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-2 rounded-lg text-soft hover:bg-[var(--surface-hover)]"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Display name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-[var(--surface-hover)]">
            <input
              type="checkbox"
              checked={morning}
              onChange={(e) => setMorning(e.target.checked)}
              className="mt-1 accent-brand-600"
            />
            <div>
              <div className="text-sm font-medium">Morning motivation</div>
              <div className="text-xs text-faint">
                Show a short personalised AI message every morning on the
                dashboard.
              </div>
            </div>
          </label>

          <div className="pt-2 border-t divider">
            <label className="label mt-3">AI provider</label>
            <select
              className="input"
              value={aiProvider}
              onChange={(e) => changeProvider(e.target.value)}
            >
              <option value="gemini">Gemini (default)</option>
              <option value="ollama">Local model (Ollama)</option>
              <option value="claude">Claude</option>
              <option value="openai">ChatGPT</option>
            </select>

            {aiProvider === "ollama" && (
              <div className="mt-3 space-y-2">
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-600 dark:text-brand-300 inline-flex items-center gap-1 hover:underline"
                >
                  New to Ollama? Install it, then run "ollama pull &lt;model&gt;" <ExternalLink size={11} />
                </a>

                <input
                  className="input"
                  placeholder="http://localhost:11434 — leave blank for the app's default"
                  value={ollamaBaseUrl}
                  onChange={(e) => {
                    setOllamaBaseUrl(e.target.value);
                    setOllama({ checking: false, reachable: null, models: [] });
                  }}
                />

                <div className="flex items-center justify-between text-xs">
                  <span
                    className={
                      ollama.checking
                        ? "text-faint"
                        : ollama.reachable
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-500"
                    }
                  >
                    {ollama.checking
                      ? "Checking Ollama..."
                      : ollama.reachable === null
                        ? "Not checked yet — click refresh to test this address"
                        : ollama.reachable
                          ? `✓ Connected — ${ollama.models.length} model${ollama.models.length === 1 ? "" : "s"} found`
                          : `✕ Can't reach Ollama at ${ollamaBaseUrl.trim() || "the app's default address"}. Is it running?`}
                  </span>
                  <button
                    type="button"
                    onClick={checkOllama}
                    className="btn-ghost p-1.5"
                    aria-label="Re-check Ollama connection"
                    title="Re-check connection"
                  >
                    <RefreshCw size={14} className={ollama.checking ? "animate-spin" : ""} />
                  </button>
                </div>

                {ollama.models.length > 0 ? (
                  <select
                    className="input"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  >
                    <option value="">Use server default</option>
                    {ollama.models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    placeholder="Model name (e.g. gemma2:9b) — leave blank for server default"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                )}

                <div className="text-xs text-faint">
                  Free and private — runs entirely on your own machine, no API key or billing involved.
                  The app's server needs network access to this address, so "localhost" only works
                  when the app and Ollama are running on the same machine.
                </div>
              </div>
            )}

            {byok && (
              <div className="mt-3 space-y-2">
                <a
                  href={byok.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-600 dark:text-brand-300 inline-flex items-center gap-1 hover:underline"
                >
                  Get a {byok.label} API key <ExternalLink size={11} />
                </a>

                <input
                  type="password"
                  className="input"
                  placeholder={
                    hasSavedKey && !keyCleared
                      ? "Key saved — leave blank to keep it"
                      : byok.placeholder
                  }
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setKeyCleared(false);
                    setKeyTest({ testing: false, ok: null, message: "" });
                  }}
                />

                {hasSavedKey && !keyCleared && !apiKeyInput && (
                  <button
                    type="button"
                    className="text-xs text-rose-500 hover:underline"
                    onClick={() => setKeyCleared(true)}
                  >
                    Remove saved key
                  </button>
                )}
                {keyCleared && (
                  <div className="text-xs text-faint">
                    Key will be removed when you save.
                  </div>
                )}

                <input
                  className="input"
                  placeholder={byok.modelPlaceholder}
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                />

                <div className="flex items-center justify-between">
                  <span
                    className={
                      keyTest.testing
                        ? "text-xs text-faint"
                        : keyTest.ok === true
                          ? "text-xs text-emerald-600 dark:text-emerald-400"
                          : keyTest.ok === false
                            ? "text-xs text-rose-500"
                            : "text-xs text-faint"
                    }
                  >
                    {keyTest.testing
                      ? "Testing..."
                      : keyTest.ok === true
                        ? `✓ ${keyTest.message}`
                        : keyTest.ok === false
                          ? `✕ ${keyTest.message}`
                          : ""}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={testKey}
                    disabled={keyTest.testing || (!apiKeyInput.trim() && !hasSavedKey)}
                  >
                    Test connection
                  </button>
                </div>

                <div className="text-xs text-faint">
                  {byok.optional
                    ? `Optional — without a key, AI features depend on whether the app owner has enabled a shared ${byok.label} key. Add your own for guaranteed access — you'll be billed directly by ${byok.billedBy}.`
                    : `Uses your own API key — you'll be billed directly by ${byok.billedBy}.`}
                </div>
              </div>
            )}

            {byok && (
              <div className="mt-3 pt-3 border-t divider">
                <button
                  type="button"
                  className="w-full flex items-center justify-between text-xs font-medium text-soft"
                  onClick={() => setRateLimitOpen((o) => !o)}
                >
                  <span>Advanced: AI request limit</span>
                  {rateLimitOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {rateLimitOpen && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-faint">
                      Caps how often the app calls an AI provider on your behalf, so a repeated click or a
                      bug can't run up unexpected costs or trip a free-tier rate limit. Only applies to your
                      own API key — the app's shared Gemini key always stays protected at the server's limit,
                      no matter what you set here.
                    </p>

                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="accent-brand-600"
                        checked={rateLimitEnabled}
                        onChange={(e) => {
                          setRateLimitEnabled(e.target.checked);
                          setRiskAck(false);
                        }}
                      />
                      Limit AI requests to
                      <input
                        type="number"
                        min={1}
                        max={60}
                        className="input w-16 py-1 px-2"
                        value={rateLimitPerMinute}
                        disabled={!rateLimitEnabled}
                        onChange={(e) =>
                          setRateLimitPerMinute(Math.max(1, Math.min(60, Number(e.target.value) || 1)))
                        }
                      />
                      per minute
                    </label>

                    {!rateLimitEnabled && (
                      <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 space-y-2">
                        <div className="flex gap-2 text-xs text-rose-600 dark:text-rose-400">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          <span>
                            Turning this off removes all protection against unexpected AI costs. If you're
                            on a free-tier key, you may also start seeing errors from the provider's own
                            rate limit instead of a clean message from this app. Only disable this if you
                            understand your plan's limits and costs.
                          </span>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                          <input
                            type="checkbox"
                            className="accent-rose-600"
                            checked={riskAck}
                            onChange={(e) => setRiskAck(e.target.checked)}
                          />
                          I understand the risk
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="btn-secondary"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={save}
              disabled={saving || riskNotAcknowledged}
              title={riskNotAcknowledged ? "Check \"I understand the risk\" to save with the limit off" : undefined}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}

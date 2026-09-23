import { useEffect, useState } from "react";
import {
  Inbox,
  BookOpen,
  Settings,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Mail,
} from "lucide-react";
import { api } from "./api";
import type { State } from "./types";
import { TaskDetail } from "./TaskDetail";
import { Preferences } from "./Preferences";
export default function App() {
  const [state, setState] = useState<State>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState("inbox"),
    [selected, setSelected] = useState(""),
    [start, setStart] = useState(""),
    [zone, setZone] = useState("America/New_York"),
    [duration, setDuration] = useState(30),
    [confirm, setConfirm] = useState(false);
  const refresh = async () => {
    const s = await api("state");
    setState(s);
    setSelected((id) => id || s.tasks[0]?.id || "");
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    if (new URLSearchParams(location.search).get("connection") === "error")
      setError(
        "Google connection failed. Check OAuth test user, callback URL and granted scopes, then reconnect.",
      );
  }, []);
  async function run(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await api(path, state?.csrf, body);
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      await refresh().catch(() => {});
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const task = state?.tasks.find((t) => t.id === selected);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-icon">
            <Inbox size={23} />
          </span>
          InboxOps<span className="brand-dot">.</span>
        </a>
        <p className="brand-sub">A little help. A final say.</p>
        <nav aria-label="Main navigation">
          {[
            { id: "inbox", label: "Inbox queue", Icon: Inbox },
            { id: "preferences", label: "Preferences", Icon: BookOpen },
            { id: "settings", label: "Connections", Icon: Settings },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              className={page === id ? "nav-item active" : "nav-item"}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              {label}
              {id === "inbox" && (
                <span className="count">{state?.tasks.length || 0}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={22} />
          <strong>Always your call</strong>
          <p>Nothing leaves your mailbox without your exact approval.</p>
          <small>LOCAL-FIRST · TEST ACCOUNTS ONLY</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Personal workspace <span className="divider">/</span>{" "}
            {page === "inbox"
              ? "Inbox queue"
              : page === "preferences"
                ? "Preferences"
                : "Connections"}
          </span>
          <span className="connection">
            <span className={`dot ${state?.connected ? "verified" : ""}`} />
            {state?.mode === "fixture"
              ? "Fixture sandbox"
              : state?.connected
                ? "Test account connected"
                : "Test account disconnected"}
          </span>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <h1>
                {page === "inbox"
                  ? "From inbox to intention."
                  : page === "preferences"
                    ? "Context you control."
                    : "Connect with confidence."}
              </h1>
              <p>
                {page === "inbox"
                  ? "Review the reasoning. Approve the action. Keep the final say."
                  : page === "preferences"
                    ? "Small, approved sources. Clear, traceable decisions."
                    : "A dedicated test account, a local model, and explicit boundaries."}
              </p>
            </div>
            {page === "inbox" && (
              <button
                className="primary process"
                disabled={busy || !state || !state.connected}
                onClick={() =>
                  run("process", {
                    ...(confirm && start
                      ? {
                          context: { start, timeZone: zone, duration },
                          selectedId: selected || undefined,
                        }
                      : {}),
                  })
                }
              >
                <RefreshCw size={17} className={busy ? "spin" : ""} />
                {busy ? "Processing…" : "Process new mail"}
              </button>
            )}
          </div>
          {state?.mode === "fixture" && (
            <div className="mode-banner">
              <span>
                <strong>Fixture sandbox</strong> Fictional email, scripted
                decisions and simulated Google actions. No live inference.
              </span>
              <span>LIVE ACCEPTANCE UNVERIFIED</span>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <strong>Action needs attention</strong>
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() => {
                  setError("");
                  refresh().catch((e) => setError(e.message));
                }}
              >
                Refresh status
              </button>
            </div>
          )}
          {busy && (
            <p role="status" className="busy-status">
              Working locally. Please wait for the result before retrying.
            </p>
          )}
          {!state ? (
            <div className="empty">
              <RefreshCw />
              <h2>Loading your workspace…</h2>
            </div>
          ) : page === "preferences" ? (
            <Preferences state={state} busy={busy} run={run} />
          ) : page === "settings" ? (
            <article className="detail settings">
              <h2>Connections</h2>
              <div className="source-row">
                <div>
                  <h3>Google test account</h3>
                  <p>{state.account || "No account connected"}</p>
                  <small>
                    OAuth client:{" "}
                    {state.oauthConfigured ? "configured" : "not configured"} ·
                    Test boundary:{" "}
                    {state.configured ? "configured" : "not configured"}
                  </small>
                </div>
                <span className="status">
                  {state.connected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <p>
                Credentials stay on this machine. OAuth access tokens are held
                in memory and expire; restarting requires reconnecting.
              </p>
              <div className="button-group">
                <button
                  className="primary"
                  disabled={busy || state.mode === "fixture"}
                  onClick={async () => {
                    const r = await run("oauth/start", {});
                    if (r?.url) location.assign(r.url);
                  }}
                >
                  Connect / reconnect Google <ArrowRight size={16} />
                </button>
                <button
                  className="secondary"
                  disabled={
                    busy || !state.connected || state.mode === "fixture"
                  }
                  onClick={async () => {
                    const r = await run("disconnect", {});
                    if (r?.revoked === false) setError(r.message);
                  }}
                >
                  Disconnect & erase token
                </button>
              </div>
              <section className="section">
                <h3>Local model</h3>
                <code>{state.model}</code>
                <p>
                  {state.mode === "fixture"
                    ? "Deterministic test double. This is not a language model."
                    : "Ollama at 127.0.0.1:11434. No hosted fallback. Run npm run model:check to verify inference and tool selection."}
                </p>
              </section>
              <section className="section">
                <h3>Before connecting</h3>
                <p>
                  Follow <code>docs/oauth-setup.md</code> in the repository.
                  Configure the dedicated test account, allowed test sender,
                  existing test label ID, and owned test calendar ID. Do not
                  paste credentials into chat.
                </p>
                <p>
                  The OAuth scopes can access more than the test label; InboxOps
                  applies the label and recipient restrictions in its server.
                </p>
              </section>
            </article>
          ) : (
            <>
              <details className="context-panel" open={!task?.plan}>
                <summary>
                  Resolve the meeting time{" "}
                  <span>Required for ambiguous requests</span>
                </summary>
                <p>
                  Read the request, then confirm its intended time. Use an
                  explicit UTC offset for the chosen IANA time zone.
                </p>
                <div className="context-fields">
                  <label>
                    Start (ISO 8601 with offset)
                    <input
                      placeholder="2026-09-29T14:00:00-04:00"
                      value={start}
                      onChange={(e) => {
                        setStart(e.target.value);
                        setConfirm(false);
                      }}
                    />
                  </label>
                  <label>
                    IANA time zone
                    <input
                      value={zone}
                      onChange={(e) => {
                        setZone(e.target.value);
                        setConfirm(false);
                      }}
                    />
                  </label>
                  <label>
                    Minutes
                    <input
                      type="number"
                      min="15"
                      max="120"
                      value={duration}
                      onChange={(e) => {
                        setDuration(Number(e.target.value));
                        setConfirm(false);
                      }}
                    />
                  </label>
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />{" "}
                  I confirm this date, time zone and duration for the selected
                  request.
                </label>
              </details>
              <div className="inbox-layout">
                <section className="queue" aria-label="Inbox task queue">
                  <div className="queue-heading">
                    <h2>To review</h2>
                    <span>{state.tasks.length}</span>
                  </div>
                  {state.tasks.map((t) => (
                    <button
                      className={`task-row ${t.id === selected ? "selected" : ""}`}
                      key={t.id}
                      onClick={() => {
                        setSelected(t.id);
                        setConfirm(false);
                      }}
                    >
                      <div className="task-top">
                        <span className="avatar small">
                          {t.thread.from[0].toUpperCase()}
                        </span>
                        <strong>{t.thread.from.split("@")[0]}</strong>
                        <span className="task-dot" />
                      </div>
                      <h3>{t.thread.subject}</h3>
                      <p>{t.thread.body.slice(0, 80)}</p>
                      <span className="status">{t.status}</span>
                    </button>
                  ))}
                  {!state.tasks.length && (
                    <div className="queue-empty">
                      <Mail size={28} />
                      <p>Your queue is clear.</p>
                      <small>
                        Process new mail to inspect recent messages in the test
                        label.
                      </small>
                    </div>
                  )}
                  <div className="queue-note">
                    <ShieldCheck size={16} />
                    <small>
                      {state.mode === "fixture"
                        ? "Fictional fixture mailbox"
                        : "Selected test label only"}
                      <br />
                      Up to 10 recent messages per run
                    </small>
                  </div>
                </section>
                {task ? (
                  <TaskDetail
                    key={task.hash || task.id}
                    task={task}
                    busy={busy}
                    act={async (kind) => {
                      await run("actions", {
                        id: task.id,
                        hash: task.hash,
                        kind,
                        approved: true,
                      });
                    }}
                    deny={() => run("deny", { id: task.id })}
                  />
                ) : (
                  <article className="detail empty">
                    <span className="empty-icon">
                      <Inbox size={38} />
                    </span>
                    <h2>A clearer inbox starts here.</h2>
                    <p>
                      {state.connected
                        ? "Process new mail to turn a scheduling request into a reviewable plan."
                        : "Connect your dedicated test account to get started."}
                    </p>
                    <div className="empty-steps">
                      <span>
                        01 <strong>Read & retrieve</strong>
                      </span>
                      <span>
                        02 <strong>Review the plan</strong>
                      </span>
                      <span>
                        03 <strong>Approve each action</strong>
                      </span>
                    </div>
                    {!state.connected && (
                      <button
                        className="primary"
                        onClick={() => setPage("settings")}
                      >
                        Set up connections <ArrowRight size={16} />
                      </button>
                    )}
                  </article>
                )}
              </div>
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>InboxOps Agent</span>
          <span>Local by design. Human by decision.</span>
        </footer>
      </div>
    </div>
  );
}

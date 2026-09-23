import { useState } from "react";
import {
  Check,
  FileText,
  Calendar,
  Send,
  ShieldCheck,
  BookOpen,
  Clock,
  ChevronDown,
} from "lucide-react";
import type { TaskView } from "./types";
import type { Action } from "../server/domain";
export function TaskDetail({
  task,
  busy,
  act,
  deny,
}: {
  task: TaskView;
  busy: boolean;
  act: (kind: Action) => Promise<void>;
  deny: () => void;
}) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const p = task.plan;
  return (
    <article className="detail">
      <div className="detail-heading">
        <div>
          <span className="overline">SELECTED THREAD</span>
          <h2>{task.thread.subject}</h2>
        </div>
        <span className="status">{task.status}</span>
      </div>
      <section className="original">
        <div className="sender">
          <span className="avatar">{task.thread.from[0].toUpperCase()}</span>
          <div>
            <strong>{task.thread.from}</strong>
            <small>To {task.thread.to}</small>
          </div>
        </div>
        <p className="email-body">{task.thread.body}</p>
        <details>
          <summary>
            Thread identity <ChevronDown size={14} />
          </summary>
          <code>
            {task.thread.id} / {task.thread.messageId}
          </code>
        </details>
      </section>
      {task.question && (
        <div className="notice" role="status">
          <strong>A little context is needed</strong>
          <p>{task.question}</p>
        </div>
      )}
      {task.error && (
        <div className="error" role="alert">
          <strong>Processing stopped safely</strong>
          <p>{task.error}</p>
          <p>
            Check the connection or model, then use Process new mail to retry.
          </p>
        </div>
      )}
      {p && (
        <>
          <section className="section">
            <div className="section-title">
              <BookOpen size={19} />
              <h3>Why this plan</h3>
              <span>Approved preferences</span>
            </div>
            {p.citations.length ? (
              p.citations.map((c) => (
                <blockquote key={c.id}>
                  <p>{c.snippet}</p>
                  <footer>
                    {c.title} <code>#{c.id}</code>
                  </footer>
                </blockquote>
              ))
            ) : (
              <p className="muted">
                No relevant approved preference was retrieved. Review the time
                carefully.
              </p>
            )}
            <small>
              Sources inform the proposal; they cannot authorize actions.
            </small>
          </section>
          <section className="section">
            <div className="section-title">
              <Calendar size={19} />
              <h3>Proposed meeting</h3>
            </div>
            <div className="meeting">
              <div className="date-block">
                <Calendar size={25} />
                <strong>
                  {new Date(p.event.start).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    timeZone: p.event.timeZone,
                  })}
                </strong>
              </div>
              <div>
                <strong>{p.event.summary}</strong>
                <p>
                  {new Date(p.event.start).toLocaleString(undefined, {
                    timeZone: p.event.timeZone,
                  })}{" "}
                  –{" "}
                  {new Date(p.event.end).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: p.event.timeZone,
                  })}
                </p>
                <small>
                  {p.event.timeZone} ·{" "}
                  {(Date.parse(p.event.end) - Date.parse(p.event.start)) /
                    60000}{" "}
                  minutes
                </small>
              </div>
            </div>
            <p className="muted">
              Calendar hold only · Attendees: none · No invitations
            </p>
            <small>
              Availability was checked for this exact time. The recipient has
              not confirmed it.
            </small>
          </section>
          <section className="section">
            <div className="section-title">
              <FileText size={19} />
              <h3>Exact reply preview</h3>
            </div>
            <dl className="message-meta">
              <dt>From</dt>
              <dd>{p.account}</dd>
              <dt>To</dt>
              <dd>{p.recipient}</dd>
              <dt>Subject</dt>
              <dd>{p.subject}</dd>
            </dl>
            <div className="reply-body">{p.body}</div>
          </section>
          <section className="approval">
            <div className="section-title">
              <ShieldCheck size={20} />
              <h3>You decide what happens</h3>
            </div>
            <p>
              Each action is separate. Check its box after reviewing the exact
              content above.
            </p>
            {(["draft", "event", "send"] as Action[]).map((kind) => {
              const existing = task.actions.find((a) => a.kind === kind);
              const done = existing?.status === "verified";
              const uncertain = existing && !done;
              const labels = {
                draft: "Create this draft",
                event: "Create this calendar hold",
                send: "Send this exact reply",
              };
              const Icon = { draft: FileText, event: Calendar, send: Send }[
                kind
              ];
              return (
                <div className="approval-row" key={kind}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checks[kind] || false}
                      disabled={busy || done || task.status === "denied"}
                      onChange={(e) =>
                        setChecks({ ...checks, [kind]: e.target.checked })
                      }
                    />
                    <span>
                      {labels[kind]}
                      <small>
                        {kind === "send"
                          ? `Only to ${p.recipient}`
                          : kind === "event"
                            ? "No guests will be invited"
                            : "Save to the connected test mailbox"}
                      </small>
                    </span>
                  </label>
                  <button
                    className={kind === "send" ? "primary" : "secondary"}
                    disabled={
                      busy ||
                      done ||
                      (!uncertain && !checks[kind]) ||
                      task.status === "denied" ||
                      (kind === "send" &&
                        !task.actions.some(
                          (a) => a.kind === "draft" && a.status === "verified",
                        ))
                    }
                    onClick={() => act(kind)}
                  >
                    {done ? <Check size={16} /> : <Icon size={16} />}{" "}
                    {done
                      ? "Verified"
                      : uncertain
                        ? "Reconcile"
                        : kind === "send"
                          ? "Approve & send"
                          : "Approve"}
                  </button>
                </div>
              );
            })}
            <div className="approval-footer">
              <button
                className="text-button"
                onClick={deny}
                disabled={busy || task.status === "denied"}
              >
                Deny pending actions
              </button>
              <details>
                <summary>Approval fingerprint</summary>
                <code>{task.hash}</code>
              </details>
            </div>
          </section>
        </>
      )}
      <section className="section">
        <div className="section-title">
          <Clock size={19} />
          <h3>Action timeline</h3>
        </div>
        <ol className="timeline">
          {task.trace.map((t, i) => (
            <li key={`t${i}`}>
              <span className="dot" />
              <div>
                <strong>{t.tool}</strong>
                <small>{new Date(t.at).toLocaleTimeString()} · MCP read</small>
              </div>
            </li>
          ))}
          {task.actions.map((a) => (
            <li key={a.kind}>
              <span
                className={`dot ${a.status === "verified" ? "verified" : ""}`}
              />
              <div>
                <strong>
                  {a.kind} · {a.status}
                </strong>
                {a.receipt ? (
                  <>
                    <small>
                      {a.receipt.mode === "fixture"
                        ? "Fixture receipt — no external action"
                        : "External receipt verified"}
                    </small>
                    <code>{a.receipt.id}</code>
                  </>
                ) : (
                  <small>
                    Unknown outcome. Reconcile only; repeating the write is
                    locked.
                  </small>
                )}
              </div>
            </li>
          ))}
        </ol>
        {!task.trace.length && (
          <p className="muted">
            Tool calls and receipts appear here as the task progresses.
          </p>
        )}
        <details>
          <summary>Audit events</summary>
          {task.timeline.map((e, i) => (
            <p key={i}>
              <small>
                {e.at} · {e.event}
              </small>
            </p>
          ))}
        </details>
      </section>
    </article>
  );
}

import { useState } from "react";
import type { State } from "./types";
export function Preferences({
  state,
  busy,
  run,
}: {
  state: State;
  busy: boolean;
  run: (path: string, body: unknown) => Promise<any>;
}) {
  const [title, setTitle] = useState("My preferences.md"),
    [text, setText] = useState(""),
    [approved, setApproved] = useState(false),
    [query, setQuery] = useState("meeting working hours"),
    [results, setResults] = useState<any[] | null>(null);
  return (
    <article className="detail">
      <h2>Approved preferences</h2>
      <p>
        Import only the preferences you want this agent to use. Updating a title
        replaces its chunks. Nothing else on your computer is indexed.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await run("preferences", { title, text, approved });
        }}
      >
        <label>
          Import a .txt or .md file
          <input
            type="file"
            accept=".txt,.md"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setTitle(f.name);
                setText(await f.text());
                setApproved(false);
              }
            }}
          />
        </label>
        <label>
          Document title
          <input
            value={title}
            maxLength={120}
            aria-invalid={!/\.(txt|md)$/i.test(title)}
            aria-describedby={
              !/\.(txt|md)$/i.test(title) ? "title-error" : undefined
            }
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {!/\.(txt|md)$/i.test(title) && (
          <p id="title-error" className="field-error">
            Use a document title ending in .txt or .md.
          </p>
        )}
        <label>
          Preference text
          <textarea
            value={text}
            maxLength={12000}
            rows={6}
            onChange={(e) => {
              setText(e.target.value);
              setApproved(false);
            }}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />{" "}
          I approve this document for retrieval
        </label>
        <button className="primary" disabled={busy || !approved || !text}>
          Import / update preferences
        </button>
      </form>
      <section className="section">
        <h3>Indexed sources</h3>
        {[...new Set(state.documents.map((d) => d.title))].map((title) => (
          <div className="source-row" key={title}>
            <span>
              <strong>{title}</strong>
              <small>
                {state.documents.filter((d) => d.title === title).length} chunks
                ·{" "}
                {state.mode === "fixture"
                  ? "fixture embeddings"
                  : "local embeddings"}
              </small>
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run("preferences/delete", { title })}
            >
              Delete
            </button>
          </div>
        ))}
        {!state.documents.length && <p>No approved sources yet.</p>}
      </section>
      <form
        className="section"
        onSubmit={async (e) => {
          e.preventDefault();
          setResults(await run("preferences/search", { query }));
        }}
      >
        <h3>Test retrieval</h3>
        <label>
          Search query
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="secondary" disabled={busy}>
          Search sources
        </button>
        {results && (
          <div aria-live="polite">
            {results.length ? (
              results.map((c) => (
                <blockquote key={c.id}>
                  <p>{c.snippet}</p>
                  <footer>
                    {c.title} · #{c.id} · {c.score.toFixed(3)}
                  </footer>
                </blockquote>
              ))
            ) : (
              <p>No relevant sources found.</p>
            )}
          </div>
        )}
      </form>
    </article>
  );
}

import { useRef, useState } from "react";
import { SAMPLES } from "./samples.js";
import { PROVIDERS, PROVIDER_LIST, countTokens } from "./providers.js";

const MAX_CHARS = 4000;

const byProvider = (fn) => Object.fromEntries(PROVIDER_LIST.map((p) => [p.id, fn(p)]));

function modelLabel(providerId, modelId) {
  return PROVIDERS[providerId].models.find((m) => m.id === modelId)?.label ?? modelId;
}

/** One provider's count (or spinner / error) inside a result tile. */
function CountTile({ p, cell, best }) {
  return (
    <div className={`count ${p.id}${best ? " best" : ""}`}>
      <span className="clabel">
        <span className="dot" aria-hidden="true" />
        {p.label}
      </span>
      {!cell && <span className="muted">—</span>}
      {cell?.status === "loading" && <span className="spinner" role="status" aria-label="Loading" />}
      {cell?.status === "done" && (
        <span className="cval">
          <strong>{cell.tokens}</strong> tokens
        </span>
      )}
      {cell?.status === "error" && <span className="err">{cell.error}</span>}
    </div>
  );
}

function lowestOf(cells) {
  const done = cells.filter((c) => c?.status === "done").map((c) => c.tokens);
  const min = Math.min(...done);
  return done.length > 1 && min !== Math.max(...done) ? min : null;
}

export default function App() {
  // Keys live only in React state: never persisted, logged, or put in a URL.
  const [keys, setKeys] = useState(() => byProvider(() => ""));
  const [shown, setShown] = useState(() => byProvider(() => false));
  const [models, setModels] = useState(() => byProvider((p) => p.models[0].id));
  const [results, setResults] = useState({}); // sampleId -> providerId -> { status, tokens?, error? }
  const [ranIds, setRanIds] = useState([]); // providers included in the comparison
  const [errors, setErrors] = useState({}); // providerId -> message (key/model/network problems)
  const [loading, setLoading] = useState(false);

  // "Try your own text": counted on its own, never added to the sample list or totals.
  const [draft, setDraft] = useState("");
  const [own, setOwn] = useState(null); // { text, cells: providerId -> cell }
  const [ownBusy, setOwnBusy] = useState(false);

  const abortRefs = useRef({});
  const ownAborts = useRef(new Set());

  const activeProviders = PROVIDER_LIST.filter((p) => keys[p.id].trim());
  const activeCount = activeProviders.length;
  const ran = PROVIDER_LIST.filter((p) => ranIds.includes(p.id));
  const activeNames = activeProviders.map((p) => p.label).join(", ");

  const setKey = (id, value) => setKeys((k) => ({ ...k, [id]: value }));
  const setCell = (sid, pid, value) =>
    setResults((r) => ({ ...r, [sid]: { ...r[sid], [pid]: value } }));

  /** Counts `list` with the `active` providers. reset=true starts a fresh comparison. */
  async function runCount(list, active, { reset }) {
    if (!active.length || !list.length) return;

    setErrors((e) => (reset ? {} : Object.fromEntries(Object.entries(e).filter(([id]) => !active.some((p) => p.id === id)))));
    setLoading(true);
    setRanIds((prev) => (reset ? active.map((p) => p.id) : [...new Set([...prev, ...active.map((p) => p.id)])]));
    setResults((r) => {
      const next = reset ? {} : { ...r };
      for (const s of list) {
        next[s.id] = { ...next[s.id], ...Object.fromEntries(active.map((p) => [p.id, { status: "loading" }])) };
      }
      return next;
    });

    await Promise.all(
      active.map(async (p) => {
        const controller = new AbortController();
        abortRefs.current[p.id] = controller;
        const apiKey = keys[p.id].trim();
        const model = models[p.id];

        await Promise.all(
          list.map(async (s) => {
            try {
              const tokens = await countTokens({ provider: p.id, apiKey, model, text: s.text, signal: controller.signal });
              setCell(s.id, p.id, { status: "done", tokens });
            } catch (err) {
              if (err?.name === "AbortError") return;
              if (err.fatal) {
                // The same failure would repeat for every sample of this provider only.
                setErrors((e) => ({ ...e, [p.id]: err.message }));
                controller.abort();
              }
              setCell(s.id, p.id, { status: "error", error: err.message });
            }
          })
        );
      })
    );

    // Requests cancelled after a fatal error never got a result; mark them as skipped.
    setResults((r) =>
      Object.fromEntries(
        Object.entries(r).map(([sid, row]) => [
          sid,
          Object.fromEntries(
            Object.entries(row).map(([pid, c]) => [pid, c.status === "loading" ? { status: "error", error: "Skipped" } : c])
          ),
        ])
      )
    );
    setLoading(false);
  }

  const countAll = () => runCount(SAMPLES, activeProviders, { reset: true });
  const countOne = (s) => runCount([s], activeProviders, { reset: false });

  async function countOwn() {
    const text = draft.trim();
    if (!text || !activeCount || ownBusy) return;
    const active = activeProviders;
    setOwnBusy(true);
    setOwn({ text, cells: Object.fromEntries(active.map((p) => [p.id, { status: "loading" }])) });

    await Promise.all(
      active.map(async (p) => {
        const controller = new AbortController();
        ownAborts.current.add(controller);
        let cell;
        try {
          const tokens = await countTokens({
            provider: p.id,
            apiKey: keys[p.id].trim(),
            model: models[p.id],
            text,
            signal: controller.signal,
          });
          cell = { status: "done", tokens };
        } catch (err) {
          if (err?.name === "AbortError") return;
          cell = { status: "error", error: err.message };
        } finally {
          ownAborts.current.delete(controller);
        }
        setOwn((o) => (o && o.text === text ? { ...o, cells: { ...o.cells, [p.id]: cell } } : o));
      })
    );
    setOwnBusy(false);
  }

  // Clears results only; API keys and model choices are kept.
  function clearResults() {
    Object.values(abortRefs.current).forEach((c) => c.abort());
    ownAborts.current.forEach((c) => c.abort());
    ownAborts.current.clear();
    setResults({});
    setRanIds([]);
    setErrors({});
    setOwn(null);
    setOwnBusy(false);
    setLoading(false);
  }

  // Per-provider totals, only when every sample succeeded.
  const totals = Object.fromEntries(
    ran.map((p) => {
      const cells = SAMPLES.map((s) => results[s.id]?.[p.id]);
      const complete = cells.every((c) => c?.status === "done");
      return [p.id, complete ? cells.reduce((n, c) => n + c.tokens, 0) : null];
    })
  );
  const doneTotals = Object.values(totals).filter((t) => t != null);
  const maxTotal = Math.max(0, ...doneTotals);
  const minTotal = Math.min(...doneTotals);
  const showResults = ran.length > 0 && Object.keys(results).length > 0;

  const ownProviders = own ? PROVIDER_LIST.filter((p) => own.cells[p.id]) : [];
  const ownLow = own ? lowestOf(ownProviders.map((p) => own.cells[p.id])) : null;

  return (
    <main className="container">
      <header>
        <h1>LLM Token Counter</h1>
        <p className="sub">
          Compare how many tokens the same text costs on Anthropic, OpenAI and Gemini, using each provider's official
          token counting API.
        </p>
      </header>

      <section aria-labelledby="keys-h">
        <h2 id="keys-h">1. Add an API key</h2>
        <p className="hint top">
          <strong>One key is enough</strong>; the other two are optional. Add more keys to compare providers side by side.
          Keys stay in this tab's memory only: never stored or logged, sent only to their own provider, gone on refresh.
        </p>

        <div className="providers">
          {PROVIDER_LIST.map((p) => {
            const hasKey = Boolean(keys[p.id].trim());
            const err = errors[p.id];
            const finished = !loading && ranIds.includes(p.id);
            let chip = ["Optional", "off"];
            if (hasKey) chip = ["Ready", "ready"];
            if (loading && ranIds.includes(p.id)) chip = ["Counting…", "busy"];
            else if (finished && err) chip = ["Failed", "bad"];
            else if (finished) chip = ["Done", "ok"];

            return (
              <div key={p.id} className={`card pcard ${p.id}${hasKey ? " on" : ""}`}>
                <div className="phead">
                  <span className="dot" aria-hidden="true" />
                  <h3>{p.label}</h3>
                  <span className={`chip ${chip[1]}`}>{chip[0]}</span>
                </div>

                <label htmlFor={`key-${p.id}`}>API key</label>
                <div className="row nowrap">
                  <input
                    id={`key-${p.id}`}
                    type={shown[p.id] ? "text" : "password"}
                    value={keys[p.id]}
                    onChange={(e) => setKey(p.id, e.target.value)}
                    placeholder={p.keyPlaceholder}
                    autoComplete="new-password"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    // Ask common password managers not to offer to save this field.
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => setShown((s) => ({ ...s, [p.id]: !s[p.id] }))}
                    aria-label={`${shown[p.id] ? "Hide" : "Show"} ${p.label} key`}
                  >
                    {shown[p.id] ? "Hide" : "Show"}
                  </button>
                </div>

                <label htmlFor={`model-${p.id}`}>Model</label>
                <select
                  id={`model-${p.id}`}
                  value={models[p.id]}
                  onChange={(e) => setModels((m) => ({ ...m, [p.id]: e.target.value }))}
                  disabled={loading}
                >
                  {p.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>

                <p className="hint">
                  Sent to {p.host} ·{" "}
                  <a href={p.docsUrl} target="_blank" rel="noreferrer noopener">
                    docs
                  </a>
                </p>

                {err && (
                  <div className="alert" role="alert">
                    {err}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="actions">
          <div className="row">
            <button type="button" className="primary" onClick={countAll} disabled={loading || activeCount === 0}>
              {loading ? "Counting…" : activeCount === 0 ? "Add at least one API key to start" : "Count All Sample Texts"}
            </button>
            <button type="button" className="ghost" onClick={clearResults}>
              Clear results
            </button>
          </div>
          <p className="hint">
            {activeCount === 0
              ? "Paste a key for any one provider above to enable counting."
              : `Counts all ${SAMPLES.length} samples using ${activeNames}.`}
          </p>
        </div>
      </section>

      <section aria-labelledby="own-h">
        <h2 id="own-h">2. Try your own text</h2>
        <div className="card">
          <label htmlFor="draft" className="first">
            Enter any text to see its token count
          </label>
          <textarea
            id="draft"
            value={draft}
            maxLength={MAX_CHARS}
            rows={3}
            placeholder="Type or paste text here…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) countOwn();
            }}
          />
          <div className="row between">
            <span className="hint">
              {draft.length}/{MAX_CHARS} characters · Ctrl+Enter to count
            </span>
            <button type="button" className="primary" onClick={countOwn} disabled={!draft.trim() || activeCount === 0 || ownBusy}>
              {ownBusy ? "Counting…" : "Count my text"}
            </button>
          </div>
          {activeCount === 0 && <p className="hint">Add an API key above to count your text.</p>}

          {own && (
            <div className="own-result" aria-live="polite">
              <div className="counts">
                {ownProviders.map((p) => (
                  <CountTile key={p.id} p={p} cell={own.cells[p.id]} best={own.cells[p.id]?.status === "done" && own.cells[p.id].tokens === ownLow} />
                ))}
              </div>
              <p className="hint">
                Result for your text ({[...own.text].length} characters). It is not added to the samples below.
                {draft.trim() !== own.text && " Your text has changed; count again to update."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section aria-live="polite" aria-labelledby="res-h">
        <div className="row between head">
          <h2 id="res-h">3. Comparison</h2>
          <button type="button" className="ghost" onClick={countAll} disabled={loading || activeCount === 0}>
            {loading ? "Counting…" : "Count all samples"}
          </button>
        </div>

        {!showResults && (
          <p className="empty card">
            Results will appear here. Each sample is counted by every provider you added a key for.
          </p>
        )}

        {showResults && (
          <div className="card totals">
            <h3>Total tokens across all samples</h3>
            {ran.map((p) => {
              const t = totals[p.id];
              const lowest = t != null && t === minTotal;
              return (
                <div key={p.id} className={`trow ${p.id}`}>
                  <span className="tname">
                    <span className="dot" aria-hidden="true" />
                    {p.label}
                    <span className="tmodel">{modelLabel(p.id, models[p.id])}</span>
                  </span>
                  <span className="bar" aria-hidden="true">
                    <span className="fill" style={{ width: t != null && maxTotal ? `${(t / maxTotal) * 100}%` : "0%" }} />
                  </span>
                  <span className="tval">
                    {loading && t == null ? (
                      <span className="spinner" role="status" aria-label="Loading" />
                    ) : t != null ? (
                      <strong>{t}</strong>
                    ) : (
                      <span className="muted">incomplete</span>
                    )}
                    {lowest && ran.length > 1 && <span className="badge low">lowest</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <ul className="samples">
          {SAMPLES.map((s) => {
            const row = results[s.id] ?? {};
            const low = lowestOf(ran.map((p) => row[p.id]));
            return (
              <li key={s.id} className="card sample">
                <div className="meta">
                  <span className="badge">{s.kind}</span>
                  <span className="chars">{[...s.text].length} chars</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => countOne(s)}
                    disabled={activeCount === 0 || loading}
                  >
                    {Object.keys(row).length > 0 ? "Recount" : "Count this text"}
                  </button>
                </div>
                <pre className="text">{s.text}</pre>

                {ran.length > 0 && (
                  <div className="counts">
                    {ran.map((p) => (
                      <CountTile key={p.id} p={p} cell={row[p.id]} best={row[p.id]?.status === "done" && row[p.id].tokens === low} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="hint">
          Each provider uses its own tokenizer, so counts differ for the same text. Anthropic and OpenAI counts include a few
          tokens of message-format overhead. The highlighted count is the lowest for that text.
        </p>
      </section>
    </main>
  );
}

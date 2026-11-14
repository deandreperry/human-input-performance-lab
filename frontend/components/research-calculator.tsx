"use client";
import { useEffect, useState } from "react";
import { Calculator, Copy, Download, Printer, Save } from "lucide-react";
import {
  blank,
  calculate,
  comparison,
  definitions,
  display,
  fmt,
  methods,
  type Calculation,
  type Inputs,
  type Method,
} from "@/lib/research-metrics";
import { csvDownload } from "@/lib/metric-export";
import { api, type Study } from "@/lib/workspace";
import { useFeed, type UsabilityStudy } from "@/lib/moderated";
import { Button } from "./ui/button";
type Worksheet = {
  title: string;
  method: Method;
  label: string;
  primary: Inputs;
  other_label: string;
  other: Inputs | null;
};
type Saved = Worksheet & { id: string; created: number };
const fresh = (method: Method): Worksheet => ({
  title: "",
  method,
  label: "Round 1",
  primary: { ...blank },
  other_label: "Round 2",
  other: null,
});

function InputGroup({
  method,
  values,
  update,
  title,
}: {
  method: Method;
  values: Inputs;
  update: (v: Inputs) => void;
  title: string;
}) {
  return (
    <fieldset className="calc-fields">
      <legend>{title}</legend>
      {definitions[method].fields.map((f) => (
        <label key={f.key}>
          {f.label}
          {f.list ? (
            <textarea
              maxLength={20000}
              rows={method === "sus" ? 4 : 3}
              value={values[f.key]}
              onChange={(e) => update({ ...values, [f.key]: e.target.value })}
            />
          ) : (
            <input
              inputMode="decimal"
              maxLength={100}
              value={values[f.key]}
              onChange={(e) => update({ ...values, [f.key]: e.target.value })}
            />
          )}{" "}
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
    </fieldset>
  );
}
function Output({ r, name }: { r: Calculation; name: string }) {
  return (
    <section className="panel calc-output" aria-label={name + " results"}>
      <div className="panel-title">
        <h2>{name}</h2>
        {r.n !== undefined && <span className="sub">n = {r.n}</span>}
      </div>
      {r.problem ? (
        <p role="status">{r.problem}</p>
      ) : !r.metrics.length ? (
        <p className="empty">Enter the required values to see results.</p>
      ) : (
        <>
          <div className="model-grid">
            {r.metrics.map((m) => (
              <div key={m.label}>
                <small>{m.label}</small>
                <b>{display(m)}</b>
              </div>
            ))}
          </div>
          <p aria-live="polite" aria-atomic="true">
            {r.interpretation}
          </p>
          <p className="sub">{r.insight}</p>
          {r.chart && (
            <figure className="calc-figure">
              <figcaption>Observed counts</figcaption>
              {r.chart.map((v, i) => (
                <div className="calc-bar" key={i}>
                  <span>{v.label}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                  >
                    <rect
                      width={
                        (100 * v.value) /
                        Math.max(...r.chart!.map((r) => r.value), 1)
                      }
                      height={10}
                      fill={i % 2 ? "#b96a33" : "#356c97"}
                    />
                  </svg>
                  <b>{v.value}</b>
                </div>
              ))}
            </figure>
          )}
          {r.interval && (
            <details>
              <summary>Inferential estimate · 95% confidence interval</summary>
              <p>
                Wilson interval: {fmt(r.interval[0])}% to {fmt(r.interval[1])}%.
                Assumes independent binary observations sampled from the
                population of interest. Small samples can yield wide intervals.
                Repeated trials and convenience sampling limit interpretation.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
function reportLines(r: Calculation) {
  return [
    ...r.metrics.map((m) => m.label + ": " + display(m)),
    r.interpretation,
    r.insight,
    ...(r.interval
      ? [
          "95% Wilson interval: " +
            r.interval.map(fmt).join(" to ") +
            "% (independent binomial observations).",
        ]
      : []),
  ];
}
export function ResearchCalculator({
  live,
  studies,
}: {
  live: boolean;
  studies: Study[];
}) {
  const [w, set] = useState<Worksheet>(() => fresh("success")),
    [project, setProject] = useState(""),
    [saved, putSaved] = useState<Saved[]>([]),
    [message, notify] = useState(""),
    [refresh, update] = useState(0),
    [busy, setBusy] = useState(false),
    [loadError, setLoadError] = useState("");
  const moderated = useFeed<UsabilityStudy[]>(
    live ? "/studies" : "",
    0,
    undefined,
    false,
  );
  const projects = [
    ...studies.map((s) => ({
      value: "pointing/" + s.id,
      name: s.title + " · Pointing",
    })),
    ...(moderated.data ?? []).map((s) => ({
      value: "moderated/" + s.id,
      name: s.title + " · Moderated",
    })),
  ];
  const selected = project || projects[0]?.value || "";
  useEffect(() => {
    let active = true;
    if (live && selected)
      api<Saved[]>("/calculations/" + selected)
        .then((rows) => {
          if (active) {
            putSaved(rows);
            setLoadError("");
          }
        })
        .catch((e) => {
          if (active) {
            putSaved([]);
            setLoadError(String(e));
          }
        });
    return () => {
      active = false;
    };
  }, [live, selected, refresh]);
  const change = (patch: Partial<Worksheet>) => {
    set({ ...w, ...patch });
    notify("");
  };
  const a = calculate(w.method, w.primary),
    b = w.other ? calculate(w.method, w.other) : null;
  const ready = !!a.metrics.length && (!b || !!b.metrics.length),
    delta = b && ready ? comparison(a.metrics[0], b.metrics[0]) : "";
  const groups = [
    { name: w.label || "Primary", result: a, input: w.primary },
    ...(b && w.other
      ? [{ name: w.other_label || "Comparison", result: b, input: w.other }]
      : []),
  ];
  const definition = definitions[w.method];
  const report = [
    w.title || methods[w.method],
    "Manual worksheet · " + methods[w.method],
    ...groups.flatMap((g) => [g.name, ...reportLines(g.result)]),
    delta,
    definition.formula,
    definition.guidance,
  ]
    .filter(Boolean)
    .join("\n");
  const csv = () => {
    const rows: (string | number)[][] = [
      ["Worksheet", w.title || methods[w.method]],
      ["Source", "Manually entered data"],
      ["Group", "Type", "Measure", "Value", "Unit"],
    ];
    for (const g of groups) {
      for (const f of definition.fields)
        rows.push([g.name, "Input", f.label, g.input[f.key], ""]);
      for (const m of g.result.metrics)
        rows.push([
          g.name,
          "Result",
          m.label,
          m.value ?? "Unavailable",
          m.unit,
        ]);
      for (const c of g.result.chart ?? [])
        rows.push([g.name, "Chart count", c.label, c.value, "observations"]);
      if (g.result.interval)
        rows.push(
          [g.name, "95% Wilson interval", "Lower", g.result.interval[0], "%"],
          [g.name, "95% Wilson interval", "Upper", g.result.interval[1], "%"],
        );
      rows.push(
        [g.name, "Interpretation", g.result.interpretation],
        [g.name, "Insight", g.result.insight],
      );
    }
    rows.push(
      ["Method", definition.formula],
      ["Guidance", definition.guidance],
      ["Comparison", delta],
    );
    csvDownload("hip-research-metrics.csv", rows);
  };
  return (
    <div className="research-calculator">
      <div className="page-title">
        <div>
          <div className="eyebrow">
            <span className="orange-line" />
            RESEARCH TOOLS
          </div>
          <h1>Research Metrics Calculator</h1>
          <p>
            Calculate a measure, compare observations, and export the results.
          </p>
        </div>
      </div>
      <div className="calc-layout">
        <section className="panel calc-controls">
          <div className="panel-title">
            <h2>
              <Calculator size={18} /> Worksheet
            </h2>
          </div>
          <label>
            Research metric
            <select
              value={w.method}
              onChange={(e) => {
                set(fresh(e.target.value as Method));
                notify("");
              }}
            >
              {Object.entries(methods).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <InputGroup
            method={w.method}
            values={w.primary}
            title="Observations"
            update={(primary) => change({ primary })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={w.other !== null}
              onChange={(e) =>
                change({ other: e.target.checked ? { ...blank } : null })
              }
            />{" "}
            Compare tasks, groups or rounds
          </label>
          {w.other && (
            <>
              <div className="form-grid">
                <label>
                  Baseline label
                  <input
                    maxLength={120}
                    value={w.label}
                    onChange={(e) => change({ label: e.target.value })}
                  />
                </label>
                <label>
                  Comparison label
                  <input
                    maxLength={120}
                    value={w.other_label}
                    onChange={(e) => change({ other_label: e.target.value })}
                  />
                </label>
              </div>
              <InputGroup
                method={w.method}
                title={w.other_label || "Comparison"}
                values={w.other}
                update={(other) => change({ other })}
              />
            </>
          )}
        </section>
        <div>
          <div className="calc-results">
            {groups.map((g, i) => (
              <Output
                key={i}
                name={groups.length === 1 ? methods[w.method] : g.name}
                r={g.result}
              />
            ))}
          </div>
          {delta && (
            <section className="panel">
              <h2>Comparison</h2>
              <p>{delta}</p>
              <p className="sub">
                Descriptive difference between the entered groups. A causal or
                significance claim requires a suitable study design.
              </p>
            </section>
          )}
          <section className="panel calc-method">
            <h2>
              {w.method === "planning"
                ? "Planning assumptions"
                : "Definition and method"}
            </h2>
            <p>{definition.formula}</p>
            <p className="sub">{definition.guidance}</p>
            {w.method === "sus" && (
              <a
                href="https://germanupa.de/sites/default/files/2021-12/brooke1996sus.pdf"
                className="text-btn"
              >
                Brooke’s SUS scoring method
              </a>
            )}
          </section>
        </div>
      </div>
      <section className="panel calc-report">
        <h2>Research report</h2>
        <label>
          Worksheet title
          <input
            value={w.title}
            maxLength={120}
            placeholder="e.g. Checkout · Round 1"
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <div className="actions">
          <Button
            variant="outline"
            disabled={!ready}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report);
                notify("Summary copied.");
              } catch {
                notify(
                  "Clipboard access failed. Use the selectable summary below.",
                );
              }
            }}
          >
            <Copy size={15} />
            Copy summary
          </Button>
          <Button variant="outline" disabled={!ready} onClick={csv}>
            <Download size={15} />
            Export CSV
          </Button>
          <Button
            variant="outline"
            disabled={!ready}
            onClick={() => window.print()}
          >
            <Printer size={15} />
            Print / save PDF
          </Button>
        </div>
        {ready && (
          <details>
            <summary>Formatted summary</summary>
            <pre>{report}</pre>
          </details>
        )}
        {live ? (
          <details>
            <summary>Save to a research study</summary>
            <div className="form-grid">
              <label>
                Research study
                <select
                  value={selected}
                  onChange={(e) => {
                    setProject(e.target.value);
                    putSaved([]);
                    notify("");
                  }}
                >
                  {!projects.length && (
                    <option value="">Create a study first</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              disabled={!selected || !ready || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/calculations/" + selected, "POST", {
                    ...w,
                    title: w.title.trim() || methods[w.method],
                    label: w.label.trim() || "Primary",
                    other_label: w.other_label.trim() || "Comparison",
                  });
                  update((v) => v + 1);
                  notify("Worksheet saved to the study.");
                } catch (e) {
                  notify(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Save size={15} />
              Save worksheet
            </Button>
            {loadError && <p role="alert">{loadError}</p>}
            {moderated.error && <p role="alert">{moderated.error}</p>}
            {saved.map((s) => (
              <div className="report-row" key={s.id}>
                <span>
                  {s.title} · {new Date(s.created * 1000).toLocaleDateString()}
                </span>
                <button
                  className="text-btn"
                  onClick={() => {
                    set({
                      title: s.title,
                      method: s.method,
                      label: s.label,
                      primary: s.primary,
                      other_label: s.other_label,
                      other: s.other,
                    });
                    notify("Saved worksheet loaded.");
                  }}
                >
                  Load {s.title}
                </button>
                <button
                  className="text-btn"
                  onClick={async () => {
                    if (!window.confirm("Delete this saved worksheet?")) return;
                    try {
                      await api(
                        "/calculations/" + selected + "/" + s.id,
                        "DELETE",
                      );
                      update((v) => v + 1);
                    } catch (e) {
                      notify(String(e));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </details>
        ) : (
          <p className="sub">
            Switch to the live workspace to save manual worksheets to a study.
          </p>
        )}
        <p role="status">{message}</p>
      </section>
      <article className="calc-print">
        <h1>{w.title || methods[w.method]}</h1>
        <p>HIP Lab · Manually entered research metrics</p>
        {groups.map((g, i) => (
          <Output key={i} name={g.name} r={g.result} />
        ))}
        <pre>{report}</pre>
      </article>
    </div>
  );
}

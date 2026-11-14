"use client";
import { useState } from "react";
import {
  outcomes,
  useFeed,
  request,
  type UsabilityStudy,
} from "@/lib/moderated";
import { csvDownload } from "@/lib/metric-export";
import { Button } from "./ui/button";
const categories = { ...outcomes, unscored: "Awaiting outcome" };
type Category = keyof typeof categories;
const keys = Object.keys(categories) as Category[];
type Row = Record<Category, number> & {
  prompt: string;
  started: number;
  notes: { at: string; text: string; outcome: Category }[];
};
type Results = { sessions: number; tasks: Row[] };
const cell = (row: Row, k: Category) =>
  row[k] +
  " / " +
  row.started +
  (row.started
    ? " (" + ((100 * row[k]) / row.started).toFixed(1) + "%)"
    : " (—)");
export function ModeratedResults({ study }: { study: UsabilityStudy }) {
  const path = "/studies/" + study.id + "/results",
    feed = useFeed<Results>(path, 0);
  const [selected, choose] = useState<number | null>(null),
    [interpretation, setInterpretation] = useState(""),
    [recommendation, setRecommendation] = useState(""),
    [error, setError] = useState("");
  async function exportReport() {
    try {
      const fresh = await request<Results>(path);
      csvDownload("moderated-study-results.csv", [
        ["Study", study.title],
        ["Eligible sessions", fresh.sessions],
        [
          "Denominator",
          "Started sessions for each task. Awaiting outcome includes active tasks.",
        ],
        [
          "Task",
          "Started",
          ...keys.map((k) => categories[k] + " (count / started and %)"),
        ],
        ...fresh.tasks.map((row) => [
          row.prompt,
          row.started,
          ...keys.map((k) => cell(row, k)),
        ]),
        ["Researcher interpretation", interpretation],
        ["Design recommendation", recommendation],
      ]);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Study results</h2>
        <Button variant="outline" onClick={exportReport} disabled={!feed.data}>
          Export aggregate CSV
        </Button>
      </div>
      <p className="sub">
        Each percentage uses sessions that started that task. Withdrawn, expired
        and deleted sessions are excluded.
      </p>
      {feed.error && <p role="alert">{feed.error}</p>}
      {feed.data && (
        <>
          <p>{feed.data.sessions} eligible sessions</p>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Moderated task comparison</caption>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Started</th>
                  {keys.map((k) => (
                    <th key={k}>{categories[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feed.data.tasks.map((r, i) => (
                  <tr key={i}>
                    <th>
                      <button
                        className="text-btn"
                        aria-expanded={selected === i}
                        onClick={() => choose(selected === i ? null : i)}
                      >
                        {r.prompt}
                      </button>
                    </th>
                    <td>{r.started}</td>
                    {keys.map((k) => (
                      <td key={k}>{cell(r, k)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected !== null && (
            <div className="prose">
              <h3>Private observations · {feed.data.tasks[selected].prompt}</h3>
              {keys.map((k) => {
                const notes = feed.data!.tasks[selected].notes.filter(
                  (n) => n.outcome === k,
                );
                return notes.length ? (
                  <section key={k}>
                    <h4>{categories[k]}</h4>
                    <ul>
                      {notes.map((n, i) => (
                        <li key={i}>
                          <time dateTime={n.at}>
                            {new Date(n.at).toLocaleString()}
                          </time>{" "}
                          · {n.text}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null;
              })}
              {!feed.data.tasks[selected].notes.length && (
                <p>No notes for this task.</p>
              )}
            </div>
          )}
          <details>
            <summary>Researcher commentary for export</summary>
            <div className="form-grid">
              <label>
                Interpretation
                <textarea
                  value={interpretation}
                  onChange={(e) => setInterpretation(e.target.value)}
                />
              </label>
              <label>
                Design recommendation
                <textarea
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                />
              </label>
            </div>
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

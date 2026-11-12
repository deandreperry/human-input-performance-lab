"use client";
import { useState } from "react";
import { api, type Trial, type SessionRow } from "@/lib/workspace";
type Trace = { points: { x: number; y: number }[]; label: string };
export function TraceInspector({
  row,
  trials,
  live,
}: {
  row: SessionRow;
  trials: Trial[];
  live: boolean;
}) {
  const [paths, setPaths] = useState<Trace[] | null>(null),
    [error, setError] = useState(""),
    [index, choose] = useState(0);
  async function load() {
    try {
      if (live) {
        const raw = await api<
          {
            events: { x: number; y: number; type: string }[];
            sequence: number;
            input_method: string;
          }[]
        >("/studies/" + row.study_id + "/export?session_id=" + row.id);
        setPaths(
          raw
            .filter((r) => r.events.some((e) => e.type === "move"))
            .map((r) => ({
              points: r.events,
              label: "Trial " + r.sequence + " · " + r.input_method,
            })),
        );
      } else
        setPaths(
          trials.flatMap((t, i) =>
            t.trajectory?.length
              ? [
                  {
                    points: t.trajectory,
                    label: "Trial " + (i + 1) + " · " + t.input_method,
                  },
                ]
              : [],
          ),
        );
    } catch (ex) {
      setError(String(ex));
    }
  }
  const trace = paths?.[index];
  const x = trace?.points.map((p) => p.x) ?? [0],
    y = trace?.points.map((p) => p.y) ?? [0];
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open && paths === null) void load();
      }}
    >
      <summary>Pointer trajectories</summary>
      {error && <p role="alert">{error}</p>}
      {trace ? (
        <>
          <select
            aria-label="Recorded trajectory"
            value={index}
            onChange={(e) => choose(+e.target.value)}
          >
            {paths?.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <svg
            role="img"
            aria-label={trace.label + " pointer path in CSS pixels"}
            viewBox={[
              Math.min(...x) - 10,
              Math.min(...y) - 10,
              Math.max(...x) - Math.min(...x) + 20,
              Math.max(...y) - Math.min(...y) + 20,
            ].join(" ")}
            className="trace"
          >
            <polyline
              fill="none"
              stroke="#5681a6"
              strokeWidth="2"
              points={trace.points.map((p) => p.x + "," + p.y).join(" ")}
            />
            <circle cx={x[0]} cy={y[0]} r="4" fill="#347a61" />
            <circle
              cx={x[x.length - 1]}
              cy={y[y.length - 1]}
              r="4"
              fill="#be7444"
            />
          </svg>
        </>
      ) : (
        <p>
          {paths === null
            ? "Loading recorded events…"
            : "No movement samples recorded."}
        </p>
      )}
    </details>
  );
}

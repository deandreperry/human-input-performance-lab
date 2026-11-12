"use client";
import { useEffect, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { api, type Study } from "@/lib/workspace";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import fixture from "@/lib/demo-data.json";
interface Fit {
  participant_id: string;
  input_method: string;
  status: string;
  intercept_ms?: number;
  slope_ms_per_bit?: number;
  r_squared?: number | null;
  residual_rmse_ms?: number;
  residual_mean_by_id?: { difficulty_bits: number; mean_residual_ms: number }[];
}
interface Result {
  quality: {
    raw_rows: number;
    eligible_rows: number;
    excluded_rows: number;
    reasons: Record<string, number>;
  };
  fits: Fit[];
  paired: null | {
    method: string;
    n_participants: number;
    effect_ms: number | null;
    ci95_ms: number[] | null;
    p_two_sided: number | null;
    cohen_dz: number | null;
    assumptions: string;
  };
  effort: {
    n_participants: number;
    median_mouse: number | null;
    median_trackpad: number | null;
  };
}
const fixed = (n: number | null | undefined, places = 1) =>
  n == null ? "—" : n.toFixed(places);
export function ModelPanel({
  studies,
  live,
}: {
  studies: Study[];
  live: boolean;
}) {
  const [id, choose] = useState(studies[0]?.id ?? ""),
    [chosenFit, setChosenFit] = useState(0),
    [state, set] = useState<{ id: string; result?: Result; error?: string }>({
      id: "",
    });
  useEffect(() => {
    let active = true;
    if (!id) return;
    const task = live
      ? api<Result>("/studies/" + id + "/analysis")
      : Promise.resolve(
          (fixture.analyses as unknown as Record<string, Result>)[id],
        );
    task
      .then((result) => {
        if (active) set({ id, result });
      })
      .catch((e) => {
        if (active) set({ id, error: String(e) });
      });
    return () => {
      active = false;
    };
  }, [id, live]);
  const result = state.id === id ? state.result : undefined,
    p = result?.paired;
  const fits = result?.fits.filter((f) => f.status === "estimated") ?? [];
  const fit = fits[chosenFit] ?? fits[0];
  const regression =
    fit?.residual_mean_by_id?.map((r) => ({
      bits: r.difficulty_bits,
      fitted:
        (fit.intercept_ms ?? 0) +
        (fit.slope_ms_per_bit ?? 0) * r.difficulty_bits,
      residual: r.mean_residual_ms,
    })) ?? [];
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>
          <ChartNoAxesCombined size={18} />
          Study-level model
        </h2>
        <select
          aria-label="Model study"
          value={id}
          onChange={(e) => choose(e.target.value)}
        >
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <p className="sub">
        {live ? "Full protocol dataset" : "Fixed synthetic reference dataset"} ·
        Independent of exploratory chart filters
      </p>
      {!result ? (
        <p className="empty">
          {state.error ?? "No estimates available for this study."}
        </p>
      ) : (
        <>
          <div className="model-grid">
            {[
              ["Paired participants", p?.n_participants ?? 0],
              ["Trackpad − mouse", fixed(p?.effect_ms) + " ms"],
              [
                "95% confidence interval",
                p?.ci95_ms
                  ? p.ci95_ms.map((n) => fixed(n)).join(" to ") + " ms"
                  : "—",
              ],
              ["Paired effect size (dᶻ)", fixed(p?.cohen_dz, 2)],
            ].map(([key, val]) => (
              <div key={key}>
                <small>{key}</small>
                <b>{val}</b>
              </div>
            ))}
          </div>
          <p>
            {p?.method ?? "Insufficient paired observations."}
            {p?.p_two_sided != null
              ? " · Two-sided p " + p.p_two_sided.toPrecision(3)
              : ""}
          </p>
          <p className="sub">
            {p?.assumptions} Incomplete paired cells can change the participant
            population represented by the estimate.
          </p>
          <details>
            <summary>Model diagnostics and data quality</summary>
            <p>
              {result.quality.eligible_rows} eligible of{" "}
              {result.quality.raw_rows} submitted trial rows.{" "}
              {Object.entries(result.quality.reasons)
                .map(([k, v]) => k.replaceAll("_", " ") + ": " + v)
                .join(" · ")}
            </p>
            <p>
              Paired effort ratings (n = {result.effort.n_participants}). Median
              mouse {fixed(result.effort.median_mouse)}, median trackpad{" "}
              {fixed(result.effort.median_trackpad)} on a 1–7 scale.
            </p>
            {fit && (
              <>
                <label>
                  Participant regression{" "}
                  <select
                    aria-label="Participant regression"
                    value={fits.indexOf(fit)}
                    onChange={(e) => setChosenFit(+e.target.value)}
                  >
                    {fits.map((f, i) => (
                      <option key={f.participant_id + f.input_method} value={i}>
                        {f.participant_id} · {f.input_method}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="axis-unit">
                  Fitted first-attempt latency (ms)
                </div>
                <div className="plot">
                  <ResponsiveContainer>
                    <LineChart data={regression}>
                      <XAxis
                        dataKey="bits"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        unit=" bits"
                      />
                      <YAxis unit=" ms" />
                      <Tooltip />
                      <Line
                        dataKey="fitted"
                        name="Fitted movement time"
                        stroke="#346ba0"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Participant",
                      "Input",
                      "Intercept (ms)",
                      "Slope (ms/bit)",
                      "R²",
                      "RMSE (ms)",
                    ].map((a) => (
                      <th key={a}>{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.fits.map((f) => (
                    <tr key={f.participant_id + f.input_method}>
                      <td>{f.participant_id}</td>
                      <td>{f.input_method}</td>
                      <td>{fixed(f.intercept_ms)}</td>
                      <td>{fixed(f.slope_ms_per_bit)}</td>
                      <td>{fixed(f.r_squared, 2)}</td>
                      <td>{fixed(f.residual_rmse_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

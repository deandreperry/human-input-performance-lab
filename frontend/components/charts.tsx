"use client";
import {
  CartesianGrid,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
} from "recharts";
import { SummaryPlot } from "./summary-plots";
import { mean, type Trial } from "@/lib/workspace";
export const colors = ["#326a9e", "#c7783b"];
export function PerformanceChart({
  trials,
  metric = "time",
}: {
  trials: Trial[];
  metric?: string;
}) {
  const ids = [
    ...new Set(
      trials.map((t) =>
        Math.log2(1 + t.target_distance / t.target_width).toFixed(2),
      ),
    ),
  ].sort((a, b) => +a - +b);
  const rows = ids.map((id) => {
    const row: Record<string, number | string> = { id: Number(id) };
    for (const method of ["mouse", "trackpad"]) {
      const matches = trials.filter(
        (t) =>
          Math.log2(1 + t.target_distance / t.target_width).toFixed(2) === id &&
          t.input_method === method,
      );
      if (matches.length)
        row[method] = Math.round(
          mean(
            matches.map((t) =>
              metric === "time"
                ? t.movement_time_ms
                : Number(!t.first_attempt_success) * 100,
            ),
          ),
        );
    }
    return row;
  });
  if (!rows.length)
    return <div className="empty">No valid trials in this selection.</div>;
  return (
    <>
      <div className="axis-unit">
        {metric === "time" ? "Movement time (ms)" : "First-attempt error (%)"}
      </div>
      <div className="plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ left: -13, right: 16, bottom: 0, top: 7 }}
          >
            <CartesianGrid
              stroke="var(--line)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="id"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickCount={6}
              tickFormatter={(n) => Number(n).toFixed(1)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, "auto"]}
              tickCount={5}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                borderColor: "var(--line)",
              }}
            />
            <Line
              name="Mouse"
              dataKey="mouse"
              stroke={colors[0]}
              strokeWidth={2.4}
              dot={{ r: 3, fill: colors[0] }}
              isAnimationActive={false}
            />
            <Line
              name="Trackpad"
              dataKey="trackpad"
              stroke={colors[1]}
              strokeWidth={2.4}
              dot={{ r: 3, fill: colors[1] }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="axis-caption">Index of difficulty (bits)</div>
    </>
  );
}
export function AnalysisPlot({
  trials,
  kind,
}: {
  trials: Trial[];
  kind: string;
}) {
  if (!trials.length)
    return <div className="empty">No trials match these filters.</div>;
  if (kind === "Device box plots" || kind === "Participant means")
    return (
      <SummaryPlot trials={trials} people={kind === "Participant means"} />
    );
  if (kind === "Fitts curve") return <PerformanceChart trials={trials} />;
  if (kind === "Errors by width") {
    const rows = [...new Set(trials.map((t) => t.target_width))]
      .sort((a, b) => a - b)
      .map((w) => ({
        label: w + " px",
        error:
          mean(
            trials
              .filter((t) => t.target_width === w)
              .map((t) => Number(!t.first_attempt_success)),
          ) * 100,
      }));
    return (
      <div className="plot">
        <ResponsiveContainer>
          <BarChart data={rows}>
            <XAxis dataKey="label" />
            <YAxis unit="%" />
            <Tooltip />
            <Bar name="Error (%)" dataKey="error" fill={colors[1]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  if (kind === "Distribution") {
    const counts: Record<number, number> = {};
    for (const t of trials) {
      const bin = Math.floor(t.movement_time_ms / 100) * 100;
      counts[bin] = (counts[bin] ?? 0) + 1;
    }
    return (
      <div className="plot">
        <ResponsiveContainer>
          <BarChart
            data={Object.entries(counts).map(([bin, count]) => ({
              bin: bin + " ms",
              count,
            }))}
          >
            <XAxis dataKey="bin" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill={colors[0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div className="plot">
      <ResponsiveContainer>
        <ScatterChart>
          <XAxis dataKey="id" name="Difficulty" unit=" bits" type="number" />
          <YAxis dataKey="mt" name="Movement" unit=" ms" type="number" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter
            data={trials.map((t) => ({
              id: +Math.log2(1 + t.target_distance / t.target_width).toFixed(2),
              mt: t.movement_time_ms,
            }))}
            fill={colors[0]}
            fillOpacity={0.45}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// Raw text survives partial edits. A metric is displayed only for complete, valid inputs.
export const methods = {
  success: "Task success",
  time: "Completion time",
  errors: "Task errors",
  completion: "Participant completion",
  conversion: "Conversion funnel",
  ratings: "Satisfaction ratings",
  sus: "System Usability Scale",
  stats: "Descriptive statistics",
  planning: "Sample size planning",
} as const;
export type Method = keyof typeof methods;
export type Inputs = { first: string; second: string; third: string };
export const blank: Inputs = { first: "", second: "", third: "" };
type Field = {
  key: keyof Inputs;
  label: string;
  hint?: string;
  list?: boolean;
};
export type Definition = { fields: Field[]; formula: string; guidance: string };
export const definitions: Record<Method, Definition> = {
  success: {
    fields: [
      { key: "first", label: "Successful participants" },
      { key: "second", label: "Participants with a scored outcome" },
    ],
    formula:
      "Success = successes / scored outcomes × 100. Failure = 100 − success.",
    guidance:
      "Count one scored attempt per participant for the same task. Define success consistently and exclude unscored attempts from this denominator.",
  },
  completion: {
    fields: [
      { key: "first", label: "Participants who finished" },
      { key: "second", label: "Participants who started" },
    ],
    formula: "Completion = finished / started × 100.",
    guidance:
      "Use one cohort and observation window. Count a participant once at each stage.",
  },
  conversion: {
    fields: [
      { key: "first", label: "People reaching the next step" },
      { key: "second", label: "People entering the step" },
    ],
    formula:
      "Conversion = reached / entered × 100. Drop-off = (entered − reached) / entered × 100.",
    guidance: "Compare consecutive steps in the same cohort and time window.",
  },
  errors: {
    fields: [
      { key: "first", label: "Attempts with at least one error" },
      { key: "second", label: "Observed attempts" },
      { key: "third", label: "Total error events" },
    ],
    formula:
      "Error rate = affected attempts / attempts × 100. Frequency = total errors / attempts.",
    guidance:
      "An attempt can contain several errors. Count affected attempts separately from error events.",
  },
  time: {
    fields: [
      {
        key: "first",
        label: "Completed task times (seconds)",
        list: true,
        hint: "Separate observations with commas, spaces or new lines.",
      },
    ],
    formula:
      "Average time = sum of completed task times / number of completed tasks.",
    guidance:
      "Use a common start and end event. Report failures and timeouts separately.",
  },
  ratings: {
    fields: [
      {
        key: "first",
        label: "Satisfaction ratings (1–5)",
        list: true,
        hint: "Enter one rating per respondent.",
      },
    ],
    formula: "Average = sum / n. Satisfied = ratings of 4 or 5 / n × 100.",
    guidance:
      "Use a five-point item where higher ratings mean greater satisfaction.",
  },
  stats: {
    fields: [
      {
        key: "first",
        label: "Numeric observations",
        list: true,
        hint: "Separate observations with commas, spaces or new lines.",
      },
    ],
    formula:
      "Mean = sum / n. Median = middle sorted value (average of the middle pair for even n). Mode = most repeated value(s). Sample SD = √[Σ(x − mean)² / (n − 1)]. Range = max − min.",
    guidance:
      "Use observations of the same measure and unit. Sample standard deviation requires at least two observations.",
  },
  sus: {
    fields: [
      {
        key: "first",
        label: "SUS responses in item order",
        list: true,
        hint: "Enter ten whole-number responses (1–5) per respondent, one respondent per line.",
      },
    ],
    formula:
      "For the original 10-item SUS, subtract 1 from odd-item responses and subtract even-item responses from 5. Sum and multiply by 2.5 for each respondent, then average scores.",
    guidance:
      "Use the original alternating item order. Report SUS on a 0–100 scale as points.",
  },
  planning: {
    fields: [
      {
        key: "first",
        label: "Expected proportion (%)",
        hint: "Use 50 for conservative planning.",
      },
      { key: "second", label: "Desired margin (± percentage points)" },
      {
        key: "third",
        label: "Available sample size",
        hint: "Optional. Estimate the margin for this many independent participants.",
      },
    ],
    formula:
      "At 95% confidence, planned n = ceil(1.96² × p(1 − p) / e²). Approximate margin = 1.96 × √[p(1 − p)/n]. Enter p and e as percentages.",
    guidance:
      "Large-sample precision planning for a single proportion under independent random sampling. Convenience recruitment, clustering and repeated trials limit generalization. This calculation does not power a difference between rounds.",
  },
};
export type Metric = {
  label: string;
  value: number | string | null;
  unit: string;
};
export type Calculation = {
  metrics: Metric[];
  interpretation: string;
  insight: string;
  n?: number;
  interval?: [number, number];
  chart?: { label: string; value: number }[];
  problem?: string;
};
export const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
export const display = (m: Metric) =>
  m.value === null
    ? "Unavailable"
    : typeof m.value === "number"
      ? fmt(m.value) + m.unit
      : m.value;
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function number(s: string) {
  const n = Number(s);
  if (
    !numberPattern.test(s.trim()) ||
    !Number.isFinite(n) ||
    Math.abs(n) > Number.MAX_SAFE_INTEGER
  )
    throw Error("Enter finite numbers within the supported precision.");
  return n;
}
function count(s: string) {
  const n = number(s);
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error("Counts must be nonnegative whole numbers.");
  return n;
}
function list(s: string) {
  if (/(^\s*,|,\s*,|,\s*$)/.test(s))
    throw Error("A value is missing between separators.");
  return s
    .trim()
    .split(/[\s,]+/)
    .map(number);
}
const metric = (label: string, value: Metric["value"], unit = ""): Metric => ({
  label,
  value,
  unit,
});
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export function wilson(k: number, n: number): [number, number] {
  const p = k / n,
    z = 1.959963984540054,
    den = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / den,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [k === 0 ? 0 : (c - h) * 100, k === n ? 100 : (c + h) * 100];
}
export function calculate(method: Method, input: Inputs): Calculation {
  const empty = { metrics: [], interpretation: "", insight: "" };
  const required = definitions[method].fields.filter(
    (f) => method !== "planning" || f.key !== "third",
  );
  if (required.some((f) => !input[f.key].trim())) return empty;
  try {
    if (["success", "completion", "conversion", "errors"].includes(method)) {
      const k = count(input.first),
        n = count(input.second);
      if (n === 0) throw Error("The denominator must be greater than zero.");
      if (k > n) throw Error("The first count cannot exceed the denominator.");
      const p = (100 * k) / n,
        rest = n - k;
      const labels =
        method === "success"
          ? ["Task success", "Task failure"]
          : method === "completion"
            ? ["Completion", "Did not finish"]
            : method === "conversion"
              ? ["Conversion", "Drop-off"]
              : ["Attempts with errors", "Error-free attempts"];
      const metrics = [
        metric(labels[0], p, "%"),
        metric(labels[1], (100 * rest) / n, "%"),
      ];
      if (method === "errors") {
        const events = count(input.third);
        if (events < k || (!k && events))
          throw Error(
            "Total errors must match the number of affected attempts or exceed it when attempts contain multiple errors.",
          );
        metrics.push(
          metric("Errors per attempt", events / n),
          metric("Error events", events),
        );
      }
      const interpretation =
        method === "success"
          ? `${k} of ${n} participants successfully completed the task.`
          : method === "conversion"
            ? `${k} of ${n} people reached the next step.`
            : method === "errors"
              ? `${k} of ${n} attempts contained at least one error.`
              : `${k} of ${n} participants finished.`;
      const insight =
        method === "errors"
          ? `Review the ${k} affected attempts alongside the event count.`
          : rest
            ? `${rest} of ${n} did not ${method === "success" ? "meet the success criterion" : method === "conversion" ? "reach the next step" : "finish"}. Review the corresponding observations for possible barriers.`
            : "Every entered observation met the criterion.";
      return {
        metrics,
        n,
        interpretation,
        insight,
        interval: method === "success" ? wilson(k, n) : undefined,
        chart: [
          { label: labels[0], value: k },
          { label: labels[1], value: rest },
        ],
      };
    }
    if (method === "planning") {
      const pct = number(input.first),
        e = number(input.second) / 100;
      if (pct <= 0 || pct >= 100 || e <= 0 || e >= 1)
        throw Error(
          "Expected proportion and margin must each be between 0 and 100, exclusive.",
        );
      const p = pct / 100,
        n = Math.ceil((1.96 ** 2 * p * (1 - p)) / e ** 2);
      if (!Number.isSafeInteger(n))
        throw Error("Choose a larger margin within supported precision.");
      const metrics = [metric("Planned participants", n)];
      if (input.third.trim()) {
        const size = count(input.third);
        if (!size) throw Error("Available sample size must be positive.");
        metrics.push(
          metric(
            "Approximate margin",
            196 * Math.sqrt((p * (1 - p)) / size),
            " pp",
          ),
        );
      }
      return {
        metrics,
        interpretation: `Plan for ${n} independent responses at the entered precision.`,
        insight:
          "The actual margin depends on recruitment and the observed proportion.",
      };
    }
    let values: number[];
    if (method === "sus") {
      values = input.first
        .trim()
        .split(/\r?\n/)
        .map((row, i) => {
          const items = list(row);
          if (
            items.length !== 10 ||
            items.some((v) => !Number.isInteger(v) || v < 1 || v > 5)
          )
            throw Error(
              `Respondent ${i + 1} needs ten integer scores from 1 to 5.`,
            );
          return (
            items.reduce(
              (sum, v, index) => sum + (index % 2 ? 5 - v : v - 1),
              0,
            ) * 2.5
          );
        });
    } else values = list(input.first);
    if (method === "time" && values.some((v) => v < 0))
      throw Error("Task times cannot be negative.");
    if (
      method === "ratings" &&
      values.some((v) => !Number.isInteger(v) || v < 1 || v > 5)
    )
      throw Error("Use whole-number ratings from 1 to 5.");
    const n = values.length,
      avg = mean(values),
      sorted = [...values].sort((a, b) => a - b),
      min = sorted[0],
      max = sorted[n - 1],
      median =
        (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2;
    const label =
        method === "sus"
          ? "Mean SUS"
          : method === "time"
            ? "Mean completion time"
            : method === "ratings"
              ? "Average rating"
              : "Mean",
      unit = method === "time" ? " s" : method === "sus" ? " pts" : "";
    const metrics = [metric(label, avg, unit), metric("Median", median, unit)];
    if (method === "stats") {
      const freq = new Map<number, number>();
      let peak = 0;
      for (const v of values) {
        const f = (freq.get(v) ?? 0) + 1;
        freq.set(v, f);
        peak = Math.max(peak, f);
      }
      const modes = [...freq]
        .filter(([, f]) => f === peak)
        .map(([v]) => v)
        .sort((a, b) => a - b);
      metrics.push(
        metric(
          "Mode",
          peak === 1 ? "No repeated value" : modes.map(fmt).join(", "),
        ),
        metric(
          "Sample SD",
          n > 1
            ? Math.sqrt(
                values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (n - 1),
              )
            : null,
        ),
        metric("Range", max - min),
      );
    }
    if (method === "ratings")
      metrics.push(
        metric(
          "Satisfied (4–5)",
          (100 * values.filter((v) => v >= 4).length) / n,
          "%",
        ),
      );
    const interpretation = `${label} is ${fmt(avg)}${unit} across ${n} ${method === "sus" ? "complete SUS responses" : "observations"}.`;
    const bins = Math.min(8, n),
      counts = new Map<string, number>();
    for (const v of values) {
      const bin =
        max === min
          ? 0
          : Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins));
      const key =
        min === max
          ? fmt(min)
          : fmt(min + (bin * (max - min)) / bins) +
            "–" +
            fmt(min + ((bin + 1) * (max - min)) / bins);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      metrics,
      n,
      interpretation,
      insight: `Observed values span ${fmt(min)} to ${fmt(max)}${unit}.`,
      chart: [...counts]
        .sort(
          ([a], [b]) =>
            parseFloat(a.replaceAll(",", "")) -
            parseFloat(b.replaceAll(",", "")),
        )
        .map(([label, value]) => ({ label, value })),
    };
  } catch (e) {
    return {
      ...empty,
      problem: e instanceof Error ? e.message : "Invalid input.",
    };
  }
}
export function comparison(a: Metric, b: Metric) {
  if (typeof a.value !== "number" || typeof b.value !== "number") return "";
  const delta = b.value - a.value;
  return `Change: ${fmt(delta)}${a.unit === "%" ? " percentage points" : a.unit}. ${a.value === 0 ? "Relative change is undefined at a zero baseline." : `Relative change: ${fmt((100 * delta) / a.value)}% relative to baseline.`}`;
}

import { mean, type Study, type Trial, type SessionRow } from "./workspace";
import fixture from "./demo-data.json";
export interface Report {
  means?: { method: string; ms: number }[];
  study_id?: string;
  title: string;
  date: string;
  sections: [string, string][];
}
export function buildDemoReport(
  s: Study,
  trials: Trial[],
  sessions: SessionRow[],
): Report {
  const records = trials.filter(
    (t) =>
      sessions.some((r) => r.study_id === s.id && r.id === t.session_id) &&
      !t.practice,
  );
  const good = records.filter(
    (t) =>
      t.valid &&
      sessions.some(
        (r) =>
          r.id === t.session_id &&
          r.eligibility !== "excluded" &&
          r.status !== "withdrawn",
      ),
  );
  const people = new Set(
    sessions.filter((r) => r.study_id === s.id).map((r) => r.participant_id),
  ).size;
  const result = fixture.analyses[s.id as keyof typeof fixture.analyses];
  const paired =
    result?.quality.eligible_rows === good.length ? result?.paired : null;
  const means = ["mouse", "trackpad"].flatMap((method) => {
    const rows = good.filter((t) => t.input_method === method);
    return rows.length
      ? [{ method, ms: mean(rows.map((t) => t.movement_time_ms)) }]
      : [];
  });
  return {
    means,
    title: s.title,
    date: new Date().toISOString(),
    sections: [
      [
        "Executive summary",
        "Synthetic demonstration data" +
          " · Descriptive report for protocol " +
          s.protocol_version +
          ".",
      ],
      ["Research objectives", s.question],
      ["Hypotheses", s.hypotheses],
      ["Methods", s.description],
      ["Participants", people + " pseudonymous participants enrolled."],
      [
        "Experimental design",
        "Within-participant mouse and trackpad blocks. Widths " +
          s.widths.join(", ") +
          " px. Distances " +
          s.distances.join(", ") +
          " px.",
      ],
      ["Measures", s.dependent_variables],
      [
        "Data quality and exclusions",
        records.length +
          " measured trials, " +
          (records.length - good.length) +
          " omitted from valid-trial summaries.",
      ],
      [
        "Descriptive results",
        good.length
          ? "Mean valid movement time " +
            mean(good.map((t) => t.movement_time_ms)).toFixed(1) +
            " ms. First-attempt success " +
            (
              100 * mean(good.map((t) => Number(t.first_attempt_success)))
            ).toFixed(1) +
            "%."
          : "No valid trials available.",
      ],
      [
        "Statistical results",
        paired && paired.effect_ms !== null
          ? `Equal-weighted paired trackpad minus mouse difference: ${paired.effect_ms.toFixed(1)} ms across ${paired.n_participants} complete participants. 95% CI ${paired.ci95_ms?.map((v) => v.toFixed(1)).join(" to ") ?? "unavailable"} ms. Paired effect size dᶻ ${paired.cohen_dz?.toFixed(2) ?? "unavailable"}. These estimates use simulated observations.`
          : "No corresponding complete-pair estimate is available for this selection.",
      ],
      [
        "Visualization",
        ["mouse", "trackpad"]
          .map((m) => {
            const a = good.filter((t) => t.input_method === m);
            return (
              m +
              " • " +
              (a.length
                ? Math.round(mean(a.map((t) => t.movement_time_ms))) + " ms"
                : "no observations")
            );
          })
          .join("   |   "),
      ],
      [
        "Interpretation",
        "These summaries describe the selected study. Review participant-level differences before interpreting device effects.",
      ],
      [
        "Limitations",
        "Self-reported device identity, browser timing and prior device familiarity affect interpretation.",
      ],
      [
        "Product design implications",
        "Consider target difficulty and error frequency together when evaluating a design.",
      ],
      [
        "Recommendations",
        "Review session deviations and uncertainty before making a design decision.",
      ],
      [
        "Future research",
        "Replicate with a broader range of device settings and accessibility contexts.",
      ],
    ],
  };
}

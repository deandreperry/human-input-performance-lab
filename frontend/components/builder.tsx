"use client";
import { useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { template, type Study } from "@/lib/workspace";
import { Button } from "./ui/button";
export function Builder({
  initial,
  onSave,
  onClose,
}: {
  initial?: Study;
  onSave: (study: Study) => Promise<void>;
  onClose: () => void;
}) {
  const [s, set] = useState<Study>(
    initial ?? { ...template, title: "", id: "" },
  );
  const [err, error] = useState(""),
    [busy, working] = useState(false);
  const put = <K extends keyof Study>(key: K, val: Study[K]) =>
    set({ ...s, [key]: val });
  return (
    <div className="page-inner">
      <div className="page-title">
        <div>
          <div className="eyebrow">POINTING EXPERIMENT TEMPLATE</div>
          <h1>{initial ? "Edit protocol" : "Create study"}</h1>
          <p>Configure the protocol and preview the participant workload.</p>
        </div>
        <Button variant="outline" onClick={onClose}>
          <X size={15} /> Close
        </Button>
      </div>
      <form
        className="panel builder"
        onSubmit={async (e) => {
          e.preventDefault();
          working(true);
          try {
            await onSave(s);
          } catch (ex) {
            error(String(ex));
          } finally {
            working(false);
          }
        }}
      >
        <h2>Study protocol</h2>
        <div className="form-grid">
          {(
            [
              ["title", "Study title"],
              ["protocol_version", "Protocol version"],
              ["question", "Research question"],
              ["hypotheses", "Prespecified hypotheses"],
              ["description", "Description"],
              ["independent_variables", "Independent variables"],
              ["dependent_variables", "Dependent variables"],
              ["control_variables", "Control variables"],
              ["inclusion_criteria", "Inclusion criteria"],
              ["exclusion_criteria", "Exclusion criteria"],
              ["sample_justification", "Sample size justification"],
            ] as const
          ).map(([k, l]) => (
            <label key={k}>
              {l}
              <textarea
                aria-label={l}
                required
                rows={k === "title" || k === "protocol_version" ? 1 : 2}
                value={s[k]}
                onChange={(e) => put(k, e.target.value)}
              />
            </label>
          ))}
        </div>
        <h2>Conditions and collection</h2>
        <div className="form-grid">
          {(["widths", "distances"] as const).map((k) => (
            <label key={k}>
              Target {k} (CSS px, comma-separated)
              <input
                required
                defaultValue={s[k].join(", ")}
                pattern="[0-9 ,]+"
                onChange={(e) =>
                  put(
                    k,
                    e.target.value.split(",").map((v) => Number(v.trim())),
                  )
                }
              />
            </label>
          ))}
          {(
            [
              ["repetitions", "Repetitions per condition"],
              ["practice_trials", "Practice trials per device"],
              ["break_interval", "Rest interval (trials)"],
              ["sample_size", "Planned sample size"],
              ["recruitment_target", "Recruitment target"],
              ["retention_days", "Retention (days)"],
            ] as const
          ).map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                type="number"
                required
                min={k === "practice_trials" || k === "break_interval" ? 0 : 1}
                value={s[k]}
                onChange={(e) => put(k, Number(e.target.value))}
              />
            </label>
          ))}
          <label>
            Trajectory collection
            <select
              value={String(s.record_trajectory)}
              onChange={(e) =>
                put("record_trajectory", e.target.value === "true")
              }
            >
              <option value="true">Pointer events and movement samples</option>
              <option value="false">Selection events only</option>
            </select>
          </label>
          <label>
            Study status
            <select
              value={s.status}
              onChange={(e) => put("status", e.target.value as Study["status"])}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>
        <div className="notice">
          <SlidersHorizontal size={18} />
          <span>
            <b>Protocol preview</b>
            <br />
            {2 * s.widths.length * s.distances.length * s.repetitions} measured
            trials · {s.practice_trials * 2} practice trials · Mouse and
            trackpad, counterbalanced order with randomized conditions.
          </span>
        </div>
        {err && <p role="alert">{err}</p>}
        <Button disabled={busy}>{busy ? "Saving…" : "Save study"}</Button>
      </form>
    </div>
  );
}

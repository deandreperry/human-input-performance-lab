import fixture from "./demo-data.json";
export interface Study {
  id: string;
  title: string;
  question: string;
  description: string;
  hypotheses: string;
  status: "active" | "draft" | "completed";
  widths: number[];
  distances: number[];
  repetitions: number;
  practice_trials: number;
  break_interval: number;
  protocol_version: string;
  sample_size: number;
  recruitment_target: number;
  retention_days: number;
  record_trajectory: boolean;
  sample_justification: string;
  independent_variables: string;
  dependent_variables: string;
  control_variables: string;
  inclusion_criteria: string;
  exclusion_criteria: string;
}
export interface SessionRow {
  id: string;
  participant_id: string;
  study_id: string;
  status: string;
  started_at: string;
  order: string[];
  notes?: string;
  exclusion_reason?: string;
  eligibility?: string;
  verified_methods?: string[];
  trial_count?: number;
}
export interface Trial {
  session_id: string;
  participant_id: string;
  input_method: string;
  target_width: number;
  target_distance: number;
  movement_time_ms: number;
  acquisition_time_ms: number | null;
  first_attempt_success: boolean;
  valid: boolean;
  practice: boolean;
  trajectory?: { x: number; y: number }[];
}
export const template: Study = {
  id: "pointing",
  title: "Mouse vs. Trackpad",
  question:
    "How does input method affect pointing performance and perceived effort?",
  description:
    "A within-subject comparison of pointing speed and accuracy across input devices.",
  hypotheses:
    "Mean first-attempt movement time differs between devices. Movement time increases with difficulty, and smaller targets reduce first-attempt accuracy.",
  status: "draft",
  widths: [24, 40, 64],
  distances: [150, 300, 450],
  repetitions: 1,
  practice_trials: 2,
  break_interval: 9,
  protocol_version: "1.0",
  sample_size: 24,
  recruitment_target: 24,
  retention_days: 90,
  record_trajectory: true,
  sample_justification:
    "Pilot precision target of 24 paired observations. Reassess variance before a confirmatory study.",
  independent_variables: "Input method, target width and distance",
  dependent_variables:
    "Movement time, first-attempt accuracy and perceived effort",
  control_variables:
    "Display, browser zoom, target geometry and task instructions",
  inclusion_criteria: "Adults able to consent with access to a desktop or laptop and both pointing devices",
  exclusion_criteria:
    "Interrupted trials excluded from movement-time estimates",
};
export const demoStudies: Study[] = [
  { ...template, status: "active" },
  {
    ...template,
    id: "precision",
    title: "Small Target Precision",
    status: "draft",
  },
  {
    ...template,
    id: "distance",
    title: "Target Distance Pilot",
    status: "completed",
  },
];
export const demoEnd = new Date("2026-11-12T23:59:59Z").getTime();
export const demoSessions: SessionRow[] = fixture.sessions;
export const demoTrials: Trial[] = fixture.trials;
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = "Request failed (" + res.status + ")";
    try {
      const d = await res.json();
      msg =
        typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail ?? d);
    } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const mean = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

import type { Method, Slot, Trial } from "../../lib/experiment";

export type Study = {
  id: string;
  title: string;
  question: string;
  description: string;
  protocol_version: string;
  retention_days: number;
  inclusion_criteria: string;
  exclusion_criteria: string;
  widths: number[];
  distances: number[];
  repetitions: number;
  practice_trials: number;
  break_interval: number;
};
export type Metadata = {
  device_category?: string;
  os?: string;
  browser?: string;
  screen_width?: number;
  screen_height?: number;
  pixel_ratio?: number;
  familiarity?: string;
  dominant_hand?: string;
  accessibility?: string;
  confirmed_method?: Method;
};
export type Session = {
  id: string;
  participant_id: string;
  study_id: string;
  protocol_version: string;
  token: string;
  order: Method[];
  protocol?: Study;
  record_trajectory?: boolean;
  schedule: Slot[];
  next_sequence: number;
  status: string;
  metadata: Metadata;
  break_interval: number;
};
export const sandbox: Study = {
  id: "sandbox",
  title: "Mouse and trackpad pointing study",
  question: "How does input method affect target acquisition?",
  description:
    "Measure pointing time and selection accuracy across different target sizes and distances.",
  protocol_version: "Sandbox",
  retention_days: 0,
  inclusion_criteria: "Access to both a mouse and a trackpad.",
  exclusion_criteria: "Touchscreen-only input.",
  widths: [24, 40, 64],
  distances: [150, 300, 450],
  repetitions: 1,
  practice_trials: 1,
  break_interval: 0,
};
export function previewSession(): Session {
  const order: Method[] = ["mouse", "trackpad"];
  return {
    id: "sandbox",
    study_id: "sandbox",
    participant_id: "Preview",
    protocol_version: "Sandbox",
    order,
    token: "",
    next_sequence: 1,
    status: "in_progress",
    metadata: {},
    break_interval: 0,
    schedule: order.flatMap((input_method, i) =>
      [true, false].map((practice, j) => ({
        sequence: 2 * i + j + 1,
        input_method,
        width: practice ? 64 : 40,
        distance: practice ? 150 : 300,
        practice,
      })),
    ),
  };
}
export class SessionApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    cache: "no-store",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const message =
      typeof error.detail === "string"
        ? error.detail
        : res.status === 404
          ? "The requested study or session is unavailable."
          : "The server could not save or load this step.";
    throw new SessionApiError(res.status, message + " (" + res.status + ")");
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
export type Receipt = { id: string; token: string };
export type Pending = { sequence: number; trial: Trial };
export function readLocal<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}
export const receiptKey = (study: string) => "hip-participant-" + study;
export const pendingKey = (id: string) => "hip-pending-" + id;

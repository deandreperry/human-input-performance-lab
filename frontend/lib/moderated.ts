"use client";
import { useEffect, useState } from "react";
export interface UsabilityStudy {
  id: string;
  title: string;
  objective: string;
  tasks: string[];
  prototype_url: string | null;
  retention_days: number;
}
export type Phase = "ready" | "working" | "review" | "withdrawn" | "completed";
export interface Progress {
  id: string;
  study_id: string;
  position: number;
  phase: Phase;
  revision: number;
  consent_at: number;
}
export interface Observer extends Progress {
  timeline: {
    at: string;
    position: number;
    kind: "start" | "review" | "note" | "outcome" | "withdraw";
    text: string;
  }[];
}
export const phases: Record<Phase, string> = {
  ready: "Ready to begin",
  working: "Task in progress",
  review: "Ready for moderator review",
  completed: "Completed",
  withdrawn: "Withdrawn",
};
export const outcomes = {
  independent: "Completed independently",
  assisted: "Completed with help",
  abandoned: "Abandoned",
};
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch("/api/moderated" + path, {
    method,
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Request failed (" + response.status + ").",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
// Serial polling avoids overlapping reads. A scope change immediately hides the previous result.
export function useFeed<T>(
  path: string,
  refresh: number,
  token?: string,
  poll = true,
) {
  const [state, set] = useState<{ key: string; data?: T; error?: string }>({
    key: "",
  });
  useEffect(() => {
    if (!path) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const data = await request<T>(path, "GET", undefined, token);
        if (active) set({ key: path, data });
      } catch (e) {
        if (active) set({ key: path, error: String(e) });
      } finally {
        if (active && poll) timer = setTimeout(tick, 2000);
      }
    }
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [path, refresh, token, poll]);
  return state.key === path ? state : { key: path };
}

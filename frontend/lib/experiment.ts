export type Method = "mouse" | "trackpad";
export type Point = { x: number; y: number };
export type TrialEvent = Point & { t: number; type: "down" | "up" | "move" };
export type Slot = {
  sequence: number;
  width: number;
  distance: number;
  input_method: Method;
  practice: boolean;
};
export type Trial = {
  start_x: number;
  start_y: number;
  start_center_x: number;
  start_center_y: number;
  start_width: number;
  target_x: number;
  target_y: number;
  target_width: number;
  started_at_ms: number;
  ended_at_ms: number;
  events: TrialEvent[];
  outcome: "completed" | "interrupted";
  interruption_reason?: string;
  input_method: Method;
};
export type Geometry = { start: Point; dx: number; dy: number };
export type TrialState =
  | { phase: "ready" }
  | { phase: "acquiring" | "releasing"; trial: Trial }
  | { phase: "finished"; trial: Trial };
export const START_WIDTH = 42;

// Coordinates are CSS pixels relative to the borderless arena. Both endpoints
// and the start click's possible offset fit inside on every allowed direction.
export function geometry(
  width: number,
  height: number,
  slot: Slot,
  rotation = 0,
): Geometry | null {
  const margin = Math.max(START_WIDTH, slot.width) / 2 + START_WIDTH / 2 + 6;
  const directions = [
    0,
    Math.PI,
    Math.PI / 4,
    (5 * Math.PI) / 4,
    (3 * Math.PI) / 4,
    (7 * Math.PI) / 4,
    Math.PI / 2,
    (3 * Math.PI) / 2,
  ];
  for (let i = 0; i < directions.length; i++) {
    const angle =
      directions[(slot.sequence + rotation + i) % directions.length];
    const dx = Math.cos(angle) * slot.distance,
      dy = Math.sin(angle) * slot.distance;
    if (
      Math.abs(dx) + margin * 2 <= width &&
      Math.abs(dy) + margin * 2 <= height
    ) {
      return { start: { x: (width - dx) / 2, y: (height - dy) / 2 }, dx, dy };
    }
  }
  return null;
}
export function inside(p: Point, center: Point, width: number) {
  return Math.hypot(p.x - center.x, p.y - center.y) <= width / 2;
}
export function begin(
  state: TrialState,
  layout: Geometry,
  slot: Slot,
  event: TrialEvent,
): TrialState {
  if (
    state.phase !== "ready" ||
    event.type !== "down" ||
    !inside(event, layout.start, START_WIDTH)
  )
    return state;
  return {
    phase: "acquiring",
    trial: {
      start_x: event.x,
      start_y: event.y,
      start_center_x: layout.start.x,
      start_center_y: layout.start.y,
      start_width: START_WIDTH,
      target_x: event.x + layout.dx,
      target_y: event.y + layout.dy,
      target_width: slot.width,
      input_method: slot.input_method,
      started_at_ms: event.t,
      ended_at_ms: event.t,
      events: [event],
      outcome: "interrupted",
    },
  };
}
export function advance(state: TrialState, event: TrialEvent): TrialState {
  if (state.phase !== "acquiring" && state.phase !== "releasing") return state;
  const trial = state.trial;
  if (event.t < trial.ended_at_ms) return state;
  // One active record owns its event array; append is O(1) at pointer frequency.
  trial.events.push(event);
  trial.ended_at_ms = event.t;
  if (state.phase === "releasing" && event.type === "up") {
    return { phase: "finished", trial: { ...trial, outcome: "completed" } };
  }
  if (
    event.type === "down" &&
    inside(event, { x: trial.target_x, y: trial.target_y }, trial.target_width)
  ) {
    return { phase: "releasing", trial };
  }
  return state;
}
export function interrupt(
  state: TrialState,
  reason: string,
  time: number,
): TrialState {
  if (state.phase !== "acquiring" && state.phase !== "releasing") return state;
  return {
    phase: "finished",
    trial: {
      ...state.trial,
      ended_at_ms: Math.max(time, state.trial.ended_at_ms),
      outcome: "interrupted",
      interruption_reason: reason,
    },
  };
}

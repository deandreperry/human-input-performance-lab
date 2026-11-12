import { describe, expect, it } from "vitest";
import {
  advance,
  begin,
  geometry,
  inside,
  interrupt,
  type Slot,
  type TrialEvent,
  type TrialState,
} from "../lib/experiment";

const slot: Slot = {
  sequence: 1,
  input_method: "mouse",
  width: 40,
  distance: 150,
  practice: false,
};
const layout = { start: { x: 100, y: 100 }, dx: 150, dy: 0 };
const ready: TrialState = { phase: "ready" };
const event = (
  type: TrialEvent["type"],
  x: number,
  y: number,
  t: number,
): TrialEvent => ({ type, x, y, t });
describe("pointing instrument", () => {
  it("requires the first down to be inside the start disk", () => {
    expect(begin(ready, layout, slot, event("up", 100, 100, 0))).toEqual(ready);
    expect(begin(ready, layout, slot, event("down", 120, 120, 0))).toEqual(
      ready,
    );
    expect(inside({ x: 120, y: 100 }, layout.start, 40)).toBe(true);
  });
  it("preserves misses, offsets the target from actual activation, and ends only after release", () => {
    let s: TrialState = begin(ready, layout, slot, event("down", 110, 98, 10));
    expect(s.phase).toBe("acquiring");
    s = advance(s, event("up", 110, 98, 15));
    s = advance(s, event("down", 230, 100, 170));
    s = advance(s, event("up", 230, 100, 175));
    expect(s.phase).toBe("acquiring");
    s = advance(s, event("down", 260, 98, 200));
    expect(s.phase).toBe("releasing");
    s = advance(s, event("up", 270, 100, 212));
    expect(s.phase).toBe("finished");
    if (s.phase !== "finished") throw Error("Expected submitted trial");
    expect(s.trial).toMatchObject({
      target_x: 260,
      target_y: 98,
      ended_at_ms: 212,
      outcome: "completed",
    });
    expect(s.trial.events).toHaveLength(6);
    expect(advance(s, event("down", 260, 98, 222))).toBe(s);
    expect(interrupt(s, "late blur", 230)).toBe(s);
  });
  it("interrupts an active trial, even after a hit but before release", () => {
    const s = advance(
      begin(ready, layout, slot, event("down", 100, 100, 3)),
      event("down", 250, 100, 120),
    );
    const result = interrupt(s, "Tab hidden", 121);
    expect(result).toMatchObject({
      phase: "finished",
      trial: {
        outcome: "interrupted",
        interruption_reason: "Tab hidden",
        ended_at_ms: 121,
      },
    });
    expect(interrupt(ready, "Tab hidden", 0)).toBe(ready);
  });
  it("rejects regressing timestamps", () => {
    const s = begin(ready, layout, slot, event("down", 100, 100, 12));
    expect(advance(s, event("down", 250, 100, 11))).toBe(s);
    if (s.phase === "ready") throw Error("Expected trial");
    expect(s.trial.events).toHaveLength(1);
  });
  it("preserves configured distance and prevents clipping across possible start offsets", () => {
    expect(geometry(120, 130, slot)).toBeNull();
    for (let i = 0; i < 8; i++) {
      const g = geometry(640, 360, { ...slot, width: 64, distance: 450 }, i);
      expect(g).not.toBeNull();
      if (!g) throw Error("Missing geometry");
      expect(Math.hypot(g.dx, g.dy)).toBeCloseTo(450);
      expect(g.start.x + g.dx - 21 - 32).toBeGreaterThanOrEqual(0);
      expect(g.start.y + g.dy + 21 + 32).toBeLessThanOrEqual(360);
    }
  });
});

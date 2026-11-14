import { describe, expect, it } from "vitest";
import {
  calculate,
  comparison,
  wilson,
  type Method,
} from "../lib/research-metrics";
const run = (method: Method, first = "", second = "", third = "") =>
  calculate(method, { first, second, third });
describe("research metrics", () => {
  it("explains scored outcomes with an independent binomial interval", () => {
    const r = run("success", "8", "10");
    expect(r.metrics.map((m) => m.value)).toEqual([80, 20]);
    expect(r.insight).toContain("2 of 10");
    expect(r.interval![0]).toBeCloseTo(49.016, 2);
    expect(r.interval![1]).toBeCloseTo(94.332, 2);
    expect(wilson(0, 1)[0]).toBe(0);
    expect(wilson(1, 1)[1]).toBe(100);
  });
  it("rejects invalid counts, empty values, impossible events and denominators", () => {
    expect(run("success", "8").metrics).toEqual([]);
    for (const [a, b] of [
      ["0", "0"],
      ["8", "7"],
      ["2.5", "8"],
      ["-1", "6"],
      ["NaN", "8"],
    ])
      expect(run("success", a, b).problem).toBeTruthy();
    expect(run("errors", "0", "8", "2").problem).toBeTruthy();
    expect(run("errors", "3", "8", "2").problem).toBeTruthy();
  });
  it("counts repeated errors separately from affected attempts", () => {
    expect(run("errors", "2", "4", "6").metrics.map((m) => m.value)).toEqual([
      50, 50, 1.5, 6,
    ]);
  });
  it("distinguishes completion, funnel conversion and drop-off", () => {
    expect(run("completion", "4", "8").metrics[0].value).toBe(50);
    expect(run("conversion", "0", "5").metrics[1].value).toBe(100);
  });
  it("computes time, satisfaction, distribution and sample statistics", () => {
    expect(run("time", "2 4 6").metrics[0].value).toBe(4);
    expect(run("stats", "1 2 2 4 4").metrics.map((m) => m.value)).toEqual([
      2.6,
      2,
      "2, 4",
      Math.sqrt(1.8),
      3,
    ]);
    expect(run("stats", "8").metrics[3].value).toBeNull();
    expect(run("ratings", "1 3 4 5").metrics[2].value).toBe(50);
    for (const [m, s] of [
      ["time", "-2"],
      ["stats", "3,,7"],
      ["ratings", "6"],
      ["stats", "Infinity"],
    ] as const)
      expect(run(m, s).problem).toBeTruthy();
  });
  it("scores ten alternating SUS items per participant", () => {
    const high = "5 1 5 1 5 1 5 1 5 1",
      low = "1 5 1 5 1 5 1 5 1 5";
    expect(run("sus", high).metrics[0].value).toBe(100);
    expect(run("sus", low).metrics[0].value).toBe(0);
    expect(run("sus", high + "\n" + low).metrics[0].value).toBe(50);
    expect(run("sus", "1 2 3").problem).toBeTruthy();
  });
  it("plans single-proportion precision and handles undefined relative changes", () => {
    expect(
      run("planning", "50", "5", "100").metrics.map((m) => m.value),
    ).toEqual([385, 9.8]);
    expect(run("planning", "0", "5").problem).toBeTruthy();
    const a = run("success", "0", "10"),
      b = run("success", "2", "10");
    expect(comparison(a.metrics[0], b.metrics[0])).toContain("undefined");
    expect(
      comparison(b.metrics[0], run("success", "3", "10").metrics[0]),
    ).toContain("50%");
  });
});

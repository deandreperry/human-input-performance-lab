import { describe, it, expect } from "vitest";
import { buildDemoReport } from "../lib/reports";
import { demoStudies, demoSessions, demoTrials } from "../lib/workspace";
describe("synthetic reports", () => {
  it("reports paired estimates only for the corresponding reference population", () => {
    const r = buildDemoReport(demoStudies[0], demoTrials, demoSessions);
    expect(r.sections).toHaveLength(16);
    expect(
      r.sections.find(([s]) => s === "Statistical results")?.[1],
    ).toContain("15 complete participants");
    const changed = demoSessions.map((s) => ({
      ...s,
      eligibility: "excluded",
    }));
    expect(buildDemoReport(demoStudies[0], demoTrials, changed).means).toEqual(
      [],
    );
  });
});

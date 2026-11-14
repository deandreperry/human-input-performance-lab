import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("calculator updates rates, compares groups, exports and reflows", async ({
  page,
}) => {
  await page.goto("/calculator");
  await page.getByLabel("Successful participants").fill("8");
  await page.getByLabel("Participants with a scored outcome").fill("10");
  await expect(
    page
      .getByText("8 of 10 participants successfully completed the task.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.getByLabel("Compare tasks, groups or rounds").check();
  await page.getByLabel("Successful participants").nth(1).fill("9");
  await page.getByLabel("Participants with a scored outcome").nth(1).fill("10");
  await expect(
    page.getByText(/Change: 10 percentage points/).first(),
  ).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await dl).suggestedFilename()).toBe("hip-research-metrics.csv");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".calc-print")).toBeVisible();
  expect((await page.pdf()).length).toBeGreaterThan(1000);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

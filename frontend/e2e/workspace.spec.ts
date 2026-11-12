import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("researcher can explore the synthetic study, export and build a draft", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Research overview" }),
  ).toBeVisible();
  await expect(page.getByText("Using synthetic data")).toBeVisible();
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "View study", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Mouse vs. Trackpad");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Create study", exact: true }).click();
  await page.getByLabel("Study title").fill("Test pilot");
  await page.getByRole("button", { name: "Save study" }).click();
  await expect(page.getByRole("button", { name: /Test pilot/ })).toBeVisible();
  await page.getByRole("link", { name: "Analysis", exact: true }).click();
  await page.getByLabel("Chart type").selectOption("Device box plots");
  await expect(
    page.getByRole("group", { name: "Movement-time box plots" }),
  ).toBeVisible();
  await expect(
    page.getByText("Paired participants", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).first().click();
  expect((await dl).suggestedFilename()).toBe("synthetic-pointing.json");
  await page.getByRole("button", { name: "Generate report" }).first().click();
  await expect(page.getByRole("dialog")).toContainText(
    "SYNTHETIC DEMONSTRATION",
  );
});
test("authenticated researcher creates and reopens a live protocol", async ({
  page,
}) => {
  test.skip(!process.env.HIP_E2E_ISOLATED);
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to live" }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.HIP_RESEARCHER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Live data", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create study", exact: true }).click();
  await page.getByLabel("Study title").fill("Live researcher pilot");
  await page.getByLabel("Study status").selectOption("active");
  await page.getByRole("button", { name: "Save study" }).click();
  await page.getByRole("button", { name: /Live researcher pilot/ }).click();
  await expect(
    page.getByRole("link", { name: "Participant session" }),
  ).toHaveAttribute("href", /study=/);
  await page.getByRole("button", { name: "Edit protocol" }).click();
  await expect(page.getByLabel("Study title")).toHaveValue(
    "Live researcher pilot",
  );
  await page
    .getByLabel("Description", { exact: true })
    .fill("Revised pilot methods.");
  await page.getByRole("button", { name: "Save study" }).click();
  await expect(
    page.getByRole("button", { name: /Live researcher pilot/ }),
  ).toBeVisible();
});

test("mobile navigation and dark theme remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("heading", { name: "Research overview" }).waitFor();
  await page.getByRole("button", { name: "Use dark theme" }).click();
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
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Studies", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Studies", exact: true }),
  ).toBeVisible();
});

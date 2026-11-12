import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function onboarding(page: Page) {
  await page.getByRole("button", { name: "View study overview" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review consent" }).click();
  await expect(
    page.getByRole("button", { name: "Consent and begin" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Consent and begin" }).click();
  await page.getByLabel("Dominant hand").selectOption("right");
  await page
    .getByLabel("How often do you use both input methods?")
    .selectOption("daily");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Device category").selectOption("laptop");
  await page.getByLabel("Operating system").selectOption("macOS");
  await page.getByLabel("Browser", { exact: true }).selectOption("Chrome");
  await page.getByRole("button", { name: "View instructions" }).click();
  await page.getByRole("button", { name: "Continue to device check" }).click();
}
async function confirmBlock(page: Page) {
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Start (practice|trial)/ }).click();
}
async function clickTarget(page: Page, selector: string) {
  const node = page.locator(selector);
  await expect(node).toBeVisible();
  const rect = await node.boundingBox();
  if (!rect) throw new Error("Target is missing.");
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}
async function completeTrial(page: Page) {
  await clickTarget(page, ".hip-start");
  await clickTarget(page, ".hip-target:not(.hip-start)");
  await expect(
    page.getByRole("heading", { name: "Trial recorded" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function finishSurvey(page: Page) {
  await page.getByLabel("Mouse effort").selectOption("2");
  await page.getByLabel("Trackpad effort").selectOption("3");
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(
    page.getByRole("heading", { name: "Session complete" }),
  ).toBeVisible();
}
test("sandbox covers consent, practice, both device blocks and effort review", async ({
  page,
}) => {
  await page.goto("/session");
  await expect(
    page.getByText("Practice sandbox · no research data saved"),
  ).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations).toEqual([]);
  await onboarding(page);
  for (let block = 0; block < 2; block++) {
    await confirmBlock(page);
    await completeTrial(page);
    await completeTrial(page);
  }
  await finishSurvey(page);
});
test("participant can withdraw and delete after consent", async ({ page }) => {
  await page.goto("/session");
  await onboarding(page);
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await page.getByRole("button", { name: "Withdraw now" }).click();
  await expect(
    page.getByRole("heading", { name: "Session withdrawn" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete my data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session data deleted" }),
  ).toBeVisible();
});
test("consented live flow persists across reload and stores interrupted trial separately", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.HIP_E2E_ISOLATED,
    "Requires an isolated disposable database configured by the integration test runner.",
  );
  const auth = await request.post("/api/auth/login", {
    data: { password: process.env.HIP_RESEARCHER_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  const create = await request.post("/api/studies", {
    data: {
      title: "Browser integration study",
      status: "active",
      widths: [40],
      distances: [150],
      practice_trials: 0,
    },
  });
  expect(create.ok()).toBeTruthy();
  const study = await create.json();
  await page.goto("/session?study=" + study.id);
  await onboarding(page);
  await confirmBlock(page);
  await clickTarget(page, ".hip-start");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Trial recorded" }),
  ).toBeVisible();
  await expect(page.getByText(/Trial interrupted/)).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await confirmBlock(page);
  await completeTrial(page);
  await finishSurvey(page);
  const runs = await (
    await request.get("/api/sessions?study_id=" + study.id)
  ).json();
  const trials = await (
    await request.get("/api/studies/" + study.id + "/export")
  ).json();
  expect(trials).toHaveLength(2);
  expect(trials[0]).toMatchObject({
    outcome: "interrupted",
    valid: false,
    sequence: 1,
  });
  expect(trials[1]).toMatchObject({
    outcome: "completed",
    valid: true,
    sequence: 2,
    first_attempt_success: true,
    misses: 0,
  });
  expect(trials[1].events.length).toBeGreaterThanOrEqual(4);
  expect(trials[1].movement_time_ms).toBeGreaterThan(0);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({
    status: "completed",
    completed_trials: 2,
    effort: { effort_mouse: 2, effort_trackpad: 3 },
  });
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete my data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session data deleted" }),
  ).toBeVisible();
  expect(
    await (await request.get("/api/sessions?study_id=" + study.id)).json(),
  ).toEqual([]);
});

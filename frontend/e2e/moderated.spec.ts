import { expect, test } from "@playwright/test";

test("moderator observes a separate participant and scores an external task", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.HIP_E2E_ISOLATED);
  await page.goto("/moderated");
  await page.getByRole("button", { name: "Sign in to live workspace" }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.HIP_RESEARCHER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Create usability study" }).click();
  await page.getByLabel("Study title").fill("Control panel usability");
  await page
    .getByLabel("Research objective")
    .fill("Observe whether the user can locate a control.");
  await page
    .getByLabel("Task prompts (one per line)")
    .fill("Set the hardware dial to standby.");
  await page.getByRole("button", { name: "Save usability study" }).click();
  const link = page.getByLabel("Participant link");
  await expect(link).toBeVisible();
  const other = await browser.newContext();
  try {
    const participant = await other.newPage();
    await participant.goto(await link.inputValue());
    await participant.getByRole("checkbox").check();
    await participant.getByRole("button", { name: "Join session" }).click();
    await participant.getByRole("button", { name: "Start task" }).click();
    await page.getByRole("button", { name: /Participant .*Monitor/ }).click();
    await page
      .getByLabel("Private observer note")
      .fill("Looked at the rear dial first.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(/Looked at the rear dial first/)).toBeVisible();
    await participant.reload();
    await participant.getByRole("button", { name: "Ready for review" }).click();
    await expect(page.getByText(/Participant requested review/)).toBeVisible();
    await page.getByRole("button", { name: "Completed with help" }).click();
    await expect(
      participant.getByRole("heading", { name: "Session complete" }),
    ).toBeVisible();
    await expect(participant.getByText(/rear dial/)).toHaveCount(0);
    await participant.getByText("Participation controls").click();
    await participant.getByRole("button", { name: "Delete my data" }).click();
    await participant
      .getByRole("button", { name: "Confirm permanent deletion" })
      .click();
    await expect(
      page.getByText("Waiting for a participant to join."),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

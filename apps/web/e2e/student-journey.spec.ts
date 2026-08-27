import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500)
      errors.push(`${response.status()} ${response.url()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectNoSeriousAccessibilityViolations(
  page: Page,
): Promise<void> {
  const axeSource = await readFile(
    require.resolve("axe-core/axe.min.js"),
    "utf8",
  );
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as typeof window & {
        axe: {
          run: () => Promise<{
            violations: Array<{ id: string; impact: string | null }>;
          }>;
        };
      }
    ).axe;
    const result = await axe.run();
    return result.violations.filter((item) =>
      ["critical", "serious"].includes(item.impact ?? ""),
    );
  });
  expect(violations).toEqual([]);
}

async function completePlanner(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Build my roadmap" }).first().click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expectNoHorizontalOverflow(page);

  await page.getByLabel("Branch").selectOption("CSE");
  await page.getByLabel("Current semester").selectOption("4");
  await page.getByLabel("Expected graduation").fill("2030-05-01");
  await page.getByRole("button", { name: "Continue to career goal" }).click();
  await expect(page).toHaveURL(/\/onboarding\/goal$/);
  await expectNoHorizontalOverflow(page);

  await page.locator('input[name="role"][value="software-engineer"]').check();
  await page.getByLabel("Target level").selectOption("INTERNSHIP_READY");
  await page.getByLabel("Target date").fill("2029-06-01");
  await page.getByRole("button", { name: "Continue to skill check" }).click();
  await expect(page).toHaveURL(/\/onboarding\/assessment$/);
  await expectNoHorizontalOverflow(page);

  const assessmentSelects = page.locator(".assessment-form select");
  await expect(assessmentSelects).toHaveCount(10);
  for (let index = 0; index < 10; index += 1)
    await assessmentSelects.nth(index).selectOption("0.25");
  await page.getByRole("button", { name: "Continue to availability" }).click();
  await expect(page).toHaveURL(/\/onboarding\/availability$/);
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Build my gap report" }).click();
  await expect(page).toHaveURL(/\/gap$/);
  await expect(
    page.getByRole("heading", { name: "CSE → Software Engineer" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

test.describe("browser-only StudentOS", () => {
  test("completes the complete planner and downloads a self-contained roadmap", async ({
    page,
  }) => {
    await completePlanner(page);
    await expect(
      page.getByText("No direct subject", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Day, week and month views")).toBeVisible();

    await page.getByRole("button", { name: "Month" }).click();
    await expect(
      page.getByText("Month 1", { exact: true }).first(),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download roadmap" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      "studentos-software-engineer-roadmap.html",
    );
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    expect((await stat(downloadPath!)).size).toBeGreaterThan(2_000);
    const content = await readFile(downloadPath!, "utf8");
    expect(content).toContain("CSE → Software Engineer");
    expect(content).toContain("Monthly roadmap");
    expect(content).toContain("Print or save as PDF");

    await page.getByRole("link", { name: "Open full roadmap" }).click();
    await expect(page).toHaveURL(/\/roadmap$/);
    await expect(
      page.getByRole("heading", { name: "Weekly checkpoints" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download roadmap" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("handles refreshes and old account routes without broken screens", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByLabel("Branch")).toBeVisible();

    await page.goto("/roadmap");
    await expect(
      page.getByText("No temporary roadmap in this browser"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Build my roadmap" }),
    ).toBeVisible();
  });

  test("clears downstream answers when the student changes branch", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.getByLabel("Branch").selectOption("CSE");
    await page.getByLabel("Current semester").selectOption("4");
    await page.getByLabel("Expected graduation").fill("2030-05-01");
    await page.getByRole("button", { name: "Continue to career goal" }).click();
    await page.locator('input[name="role"][value="software-engineer"]').check();
    await page.getByLabel("Target level").selectOption("INTERNSHIP_READY");
    await page.getByLabel("Target date").fill("2029-06-01");

    await page.goBack();
    await page.getByLabel("Branch").selectOption("ECE");
    await page.getByLabel("Current semester").selectOption("4");
    await page.getByRole("button", { name: "Continue to career goal" }).click();
    await expect(page.locator('input[name="role"]:checked')).toHaveCount(0);
    await expect(
      page.locator('input[name="role"][value="vlsi-design-engineer"]'),
    ).toBeVisible();
  });

  test("does not overflow common mobile viewports", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome");
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
    await page.goto("/onboarding");
    await expectNoHorizontalOverflow(page);
    await page.getByLabel("Branch").selectOption("CSE");
    await expectNoHorizontalOverflow(page);
  });
});

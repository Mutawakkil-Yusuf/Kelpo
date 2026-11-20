import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };

const slug = process.env.LINK_SLUG || "JJ1vzZkaDz66jA-DNWSSzlt2";

/** Vercel's edge occasionally aborts a headless navigation; retry it. */
async function open(page: import("@playwright/test").Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20_000 });
      return;
    } catch {
      if (attempt === 2) throw new Error(`Could not open ${path} after three tries`);
    }
  }
}

test("both screens fit the viewport and carry credits", async ({ page }) => {
  for (const path of ["/", `/p/${slug}`]) {
    await open(page, path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.locator(".credits a")).toHaveCount(3);
  }
});

test("a created link shows a clickable OG preview", async ({ page }) => {
  await open(page, "/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: readFileSync("tests/e2e/fixture.png"),
  });
  await page.getByPlaceholder("Brand refresh — final files").fill("Preview check");
  await page.getByRole("button", { name: "Seal & create link" }).click();
  await page.getByText("Ready to send.").waitFor({ timeout: 30_000 });

  const card = page.locator(".chat-card-link");
  await expect(card).toHaveAttribute("href", /\/p\/[A-Za-z0-9_-]+$/);
  await expect(page.locator(".og-links a").first()).toHaveAttribute("href", /\/p\//);
  const ogHref = await page.locator(".og-links a").last().getAttribute("href");
  expect(ogHref).toBeTruthy();
  const og = await page.request.get(ogHref!);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
});

test("a recipient can leave a note without an account", async ({ page }) => {
  await open(page, "/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: readFileSync("tests/e2e/fixture.png"),
  });
  await page.getByPlaceholder("Brand refresh — final files").fill("Pins check");
  await page.getByRole("button", { name: "Seal & create link" }).click();
  await page.getByText("Ready to send.").waitFor({ timeout: 30_000 });
  const url = await page.locator(".chat-card-link").getAttribute("href");

  await open(page, url!);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/create account|sign in|password/i);

  await page.locator(".frame-button").first().click();
  await page.getByRole("button", { name: "Not now" }).click();
  await page.getByRole("button", { name: "Add a note" }).click();
  await page.locator(".viewer-image").click({ position: { x: 120, y: 90 } });
  await page.getByPlaceholder("What should be changed?").fill("Crop tighter here");
  await page.getByRole("button", { name: "Pin note" }).click();
  await expect(page.getByText("Crop tighter here")).toBeVisible();
});

test("a sender can save links from an optional dashboard", async ({ page }) => {
  await open(page, "/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: readFileSync("tests/e2e/fixture.png"),
  });
  await page.getByPlaceholder("Brand refresh — final files").fill("Saved delivery");
  await page.getByRole("button", { name: "Seal & create link" }).click();
  await page.getByText("Ready to send.").waitFor({ timeout: 30_000 });

  await page.getByRole("link", { name: /Save this one to an account/ }).click();
  await page.getByText("Keep your deliveries together.").waitFor();
  await page.getByPlaceholder("you@studio.com").fill(`studio-${Date.now()}@example.com`);
  await page.locator("input[type=password]").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Your deliveries.").waitFor({ timeout: 20_000 });
  await expect(page.getByText("Saved delivery")).toBeVisible();
});

test("a recipient gets the prompt once, and the like popup opens", async ({ page }) => {
  await open(page, `/p/${slug}`);
  await page.locator(".frame-button").first().click();
  const prompt = page.getByRole("dialog", { name: "Try Kelpo" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("link", { name: "Create a link" })).toBeVisible();
  await prompt.getByRole("button", { name: "Not now" }).click();

  await page.keyboard.press("Escape");
  const like = page.getByRole("button", { name: /Like Kelpo|Liked/ });
  await like.click();
  await expect(page.getByText("Thanks for the like.")).toBeVisible();
});

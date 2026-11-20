import { expect, test } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };

const slug = process.env.LINK_SLUG || "JJ1vzZkaDz66jA-DNWSSzlt2";

test("both screens fit the viewport and carry credits", async ({ page }) => {
  for (const path of ["/", `/p/${slug}`]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.locator(".credits a")).toHaveCount(3);
  }
});

test("a recipient gets the prompt once, and the like popup opens", async ({ page }) => {
  await page.goto(`/p/${slug}`, { waitUntil: "networkidle" });
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

import { defineConfig, devices } from "@playwright/test";


declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://usekelpo.vercel.app",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});

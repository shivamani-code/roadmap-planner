import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  timeout: 60_000,
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm exec next start --port 3101",
        url: "http://127.0.0.1:3101",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});

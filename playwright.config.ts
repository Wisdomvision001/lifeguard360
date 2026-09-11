import { defineConfig, devices } from "@playwright/test";

// Responsive matrix per project brief: 320 / 360 / 390 / 430 px + desktop.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile320",
      use: { ...devices["Pixel 5"], viewport: { width: 320, height: 640 } },
    },
    {
      name: "mobile360",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } },
    },
    {
      name: "mobile390",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile430",
      use: { ...devices["iPhone 12 Pro"], viewport: { width: 430, height: 932 } },
    },
    {
      name: "desktop1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});

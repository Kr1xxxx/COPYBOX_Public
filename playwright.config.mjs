import { defineConfig } from "@playwright/test";
import { guideSeenState } from "./tests/e2e/helpers.mjs";

const baseURL = "http://127.0.0.1:3100";

// End-to-end checks in a real browser. Run with `npm run test:e2e` (builds first).
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.mjs",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // Tests start with the first-run guide already seen; tests/e2e/first-run-guide.e2e.mjs turns this off.
    storageState: guideSeenState(baseURL),
    viewport: { width: 680, height: 620 },
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start",
    env: { PORT: "3100" },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

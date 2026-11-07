
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.playwright" });

export default defineConfig({
  testDir: "./e2e",

  // Allow independent tests within a file
  // to execute in parallel.
  fullyParallel: true,

  // 3 workers performed better in your full-suite runs.
  workers: 3,

  // Do not automatically retry failed tests.
  retries: 0,

  // Maximum time per test: 90 seconds.
  timeout: 90000,

  // Maximum wait for each assertion.
  expect: {
    timeout: 10000,
  },

  // Compact terminal output + HTML report.
  reporter: [
    ["dot"],
    ["html", { open: "never" }],
  ],

  use: {
    baseURL: "http://127.0.0.1:5173",

    // Run tests without opening browser windows.
    headless: true,

    // Keep traces when a test fails.
    trace: "retain-on-failure",

    // Save screenshots of failed tests.
    screenshot: "only-on-failure",
  },

  // Test using Chromium.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  // Start the frontend automatically.
  webServer: {
    command:
      "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",

    url: "http://127.0.0.1:5173",

    // Always start a fresh Vite server.
    reuseExistingServer: false,

    timeout: 120000,

    env: {
      VITE_API_BASE_URL:
        process.env.E2E_API_BASE_URL ||
        "http://127.0.0.1:5000",
    },
  },
});

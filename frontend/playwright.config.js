
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",

  // Run one test at a time while learning.
  workers: 1,

  // Do not automatically retry failures.
  retries: 0,

  timeout: 30000,

  expect: {
    timeout: 10000,
  },

  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],

  use: {
    baseURL: "http://127.0.0.1:5173",

    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  // Playwright starts the frontend for us.
  webServer: {
    command:
      "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",

    url: "http://127.0.0.1:5173",

    // Prevent reusing a Vite server with
    // an incorrect backend configuration.
    reuseExistingServer: false,

    timeout: 120000,

    env: {
      VITE_API_BASE_URL:
        process.env.E2E_API_BASE_URL ||
        "http://127.0.0.1:5000",
    },
  },
});

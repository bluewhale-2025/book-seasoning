import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/fake-session-server.mjs",
      port: 4174,
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 4173",
      port: 4173,
      reuseExistingServer: false,
    },
  ],
});

import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4318", browserName: "chromium" },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: false,
    env: { PORT: "4318", INBOXOPS_MODE: "fixture", INBOXOPS_DB: ":memory:" },
  },
  reporter: "list",
});

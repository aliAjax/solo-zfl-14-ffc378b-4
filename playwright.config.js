import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5114"
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5114",
    reuseExistingServer: !process.env.CI
  }
});

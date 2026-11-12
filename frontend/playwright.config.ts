import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    ...(process.env.CHROME_PATH
      ? { launchOptions: { executablePath: process.env.CHROME_PATH } }
      : {}),
  },
});

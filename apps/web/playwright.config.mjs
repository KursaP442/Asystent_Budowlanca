import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";

process.loadEnvFile(".env.local");
process.env.AI_KEY_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!localUrl || !["127.0.0.1", "localhost"].includes(new URL(localUrl).hostname)) {
  throw new Error("E2E must use local Supabase; cloud tests are not allowed.");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("E2E requires the server-only local service-role key.");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3011", browserName: "chromium", channel: "msedge", trace: "off" },
  webServer: {
    command: "pnpm start --hostname 127.0.0.1 --port 3011",
    url: "http://127.0.0.1:3011",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

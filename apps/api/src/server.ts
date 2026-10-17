import "dotenv/config";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./lib/database.js";

function bootEnv() {
  try {
    return loadEnv();
  } catch (err) {
    console.error(`[api] ${(err as Error).message}`);
    process.exit(1);
  }
}

const env = bootEnv();
const db = createDatabase(env.DATABASE_URL);
const app = createApp({ env, db });

const server = app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`[api] database: ${db.configured ? "configured" : "not configured"}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} diterima, menutup server...`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    try {
      await db.disconnect();
    } finally {
      process.exit(0);
    }
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

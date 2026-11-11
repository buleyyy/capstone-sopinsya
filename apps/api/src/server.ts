import "./config/loadEnv.js";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./lib/database.js";
import { PrismaPublicContentStore } from "./stores/prismaPublicContentStore.js";
import { PrismaParticipantTestStore } from "./stores/prismaParticipantTestStore.js";

function bootEnv() {
  try {
    return loadEnv();
  } catch (err) {
    console.error(`[api] ${(err as Error).message}`);
    process.exit(1);
  }
}

async function main() {
  const env = bootEnv();
  const db = createDatabase(env.DATABASE_URL);
  const getPrisma = db.prisma?.bind(db);
  const publicContent = getPrisma ? new PrismaPublicContentStore(getPrisma) : undefined;
  const participantTests = getPrisma ? new PrismaParticipantTestStore(getPrisma) : undefined;

  const app = createApp({
    env,
    db,
    ...(publicContent ? { publicContent } : {}),
    ...(participantTests ? { participantTests } : {}),
  });

  const server = app.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    console.log(`[api] database: ${db.configured ? "configured" : "not configured"}`);
    console.log("[api] hanya melayani /api/*. Antarmuka web ada di apps/web (npm run dev:web).");
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
}

main().catch((err) => {
  console.error("[api] gagal start:", (err as Error).message);
  process.exit(1);
});

import "./config/loadEnv.js";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./lib/database.js";
import { PrismaAuditStore } from "./stores/prismaAuditStore.js";
import { PrismaPublicContentStore } from "./stores/prismaPublicContentStore.js";
import { PrismaParticipantTestStore } from "./stores/prismaParticipantTestStore.js";
import { PrismaTrainingStore } from "./stores/prismaTrainingStore.js";
import { PrismaAdminReadStore } from "./web/adminReadStore.js";

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
  const trainingStore = getPrisma ? new PrismaTrainingStore(getPrisma) : undefined;

  // Prisma Client dibuat saat boot agar store audit dapat dipakai antarmuka web. Bila gagal (mis. belum
  // `prisma generate`), server tetap hidup; halaman Auditor/Admin menjawab 503 dan health check tetap jalan.
  let audit: Parameters<typeof createApp>[0]["audit"];
  if (getPrisma) {
    try {
      const client = await getPrisma();
      audit = { store: new PrismaAuditStore(client), admin: new PrismaAdminReadStore(client) };
    } catch (err) {
      console.error(`[api] Prisma Client tidak dapat dimuat: ${(err as Error).message}`);
      console.error("[api] Jalankan `npm run prisma:generate -w @sopinsya/api`. Halaman Auditor/Admin dinonaktifkan.");
    }
  }

  const app = createApp({
    env,
    db,
    ...(publicContent ? { publicContent } : {}),
    ...(participantTests ? { participantTests } : {}),
    ...(trainingStore ? { programs: trainingStore, training: trainingStore } : {}),
    ...(audit ? { audit } : {}),
  });

  const server = app.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    console.log(`[api] database: ${db.configured ? "configured" : "not configured"}`);
    console.log(`[api] halaman Admin: ${env.ADMIN_PASSWORD ? "aktif" : "nonaktif (ADMIN_PASSWORD belum diatur)"}`);
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

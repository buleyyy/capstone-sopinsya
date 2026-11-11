import "../../api/src/config/loadEnv.js";
import { loadEnv } from "../../api/src/config/env.js";
import { createDatabase } from "../../api/src/lib/database.js";
import { PrismaAccountStore } from "../../api/src/stores/prismaAccountStore.js";
import { PrismaAuditStore } from "../../api/src/stores/prismaAuditStore.js";
import { PrismaEvidenceStore } from "../../api/src/stores/prismaEvidenceStore.js";
import { PrismaParticipantTestStore } from "../../api/src/stores/prismaParticipantTestStore.js";
import { PrismaPublicContentStore } from "../../api/src/stores/prismaPublicContentStore.js";
import { PrismaAdminReadStore } from "../admin/readStore.js";
import { createWebApp, type WebAppDeps } from "./app.js";

function bootEnv() {
  try {
    return loadEnv();
  } catch (err) {
    console.error(`[web] ${(err as Error).message}`);
    process.exit(1);
  }
}

async function main() {
  const env = bootEnv();
  const port = Number(process.env["WEB_PORT"] ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("[web] WEB_PORT tidak valid.");
    process.exit(1);
  }

  const db = createDatabase(env.DATABASE_URL);
  const getPrisma = db.prisma?.bind(db);
  const publicContent = getPrisma ? new PrismaPublicContentStore(getPrisma) : undefined;
  const participantTests = getPrisma ? new PrismaParticipantTestStore(getPrisma) : undefined;

  // Prisma Client dibuat saat boot agar store audit/admin dapat dipakai. Bila gagal (mis. belum `prisma generate`),
  // server tetap hidup; halaman Auditor/Admin menjawab 503 dan halaman peserta memakai data bawaan.
  let audit: WebAppDeps["audit"];
  if (getPrisma) {
    try {
      const client = await getPrisma();
      const accounts = new PrismaAccountStore(client);
      audit = {
        store: new PrismaAuditStore(client),
        admin: new PrismaAdminReadStore(client),
        accounts,
        evidence: new PrismaEvidenceStore(client),
      };
      try {
        if ((await accounts.countByRole("ADMIN")) === 0) {
          console.warn("[web] Belum ada akun Admin. Isi BOOTSTRAP_ADMIN_* di apps/api/.env lalu jalankan `npm run db:bootstrap-admin -w @sopinsya/api`.");
        }
      } catch (err) {
        console.warn(`[web] Tabel akun belum siap (sudah menjalankan migrasi?): ${(err as Error).message}`);
      }
    } catch (err) {
      console.error(`[web] Prisma Client tidak dapat dimuat: ${(err as Error).message}`);
      console.error("[web] Jalankan `npm run db:generate`. Halaman Auditor/Admin dinonaktifkan.");
    }
  }

  const app = createWebApp({
    env,
    db,
    whatsappUrl: process.env["WHATSAPP_URL"],
    ...(publicContent ? { publicContent } : {}),
    ...(participantTests ? { participantTests } : {}),
    ...(audit ? { audit } : {}),
  });

  const server = app.listen(port, () => {
    console.log(`[web] listening on http://localhost:${port} (${env.NODE_ENV})`);
    console.log(`[web] database: ${db.configured ? "configured" : "not configured"}`);
    console.log("[web] area: /peserta, /admin, /audit (masuk lewat /masuk)");
    if (env.LEGACY_ENV_LOGIN) {
      console.warn("[web] PERINGATAN: LEGACY_ENV_LOGIN=true (fallback kata sandi environment aktif). Hanya untuk transisi development.");
    }
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[web] ${signal} diterima, menutup server...`);
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
  console.error("[web] gagal start:", (err as Error).message);
  process.exit(1);
});

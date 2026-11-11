import path from "node:path";
import express, { type Express } from "express";
import type { Env } from "../../api/src/config/env.js";
import type { AccountStore } from "../../api/src/domain/accountStore.js";
import type { AuditStore } from "../../api/src/domain/auditStore.js";
import type { EvidenceStore } from "../../api/src/domain/evidenceFile.js";
import type { ParticipantTestStore } from "../../api/src/domain/participantTest.js";
import type { PublicContentStore } from "../../api/src/domain/publicContent.js";
import type { Database } from "../../api/src/lib/database.js";
import { createErrorHandler, notFoundHandler } from "../../api/src/middleware/errorHandler.js";
import { createHealthRouter } from "../../api/src/routes/health.js";
import { createParticipantTestRouter } from "../../api/src/routes/participantTests.js";
import { createPublicRouter, toHttpsUrl } from "../../api/src/routes/publicContent.js";
import type { AdminReadStore } from "../admin/readStore.js";
import {
  CLASS_LABEL,
  formatDate,
  formatDateTime,
  INVITE_LABEL,
  percent,
  SESSION_LABEL,
  VERSION_LABEL,
} from "../shared/helpers.js";
import { WEB_ROOT } from "../shared/paths.js";
import { createWebRouter } from "../shared/router.js";
import { WebSecurity } from "../shared/security.js";

export interface WebAppDeps {
  env: Env;
  db: Database;
  /** Sumber konten publik peserta. Bila kosong, /api/public/* menjawab 503. */
  publicContent?: PublicContentStore;
  /** Pre/Post-test peserta (dipanggil browser dari halaman peserta, satu origin). Bila kosong, menjawab 503. */
  participantTests?: ParticipantTestStore;
  /** Penyimpanan audit/admin. Bila kosong, halaman Auditor/Admin menjawab 503. */
  audit?: { store: AuditStore; admin: AdminReadStore; accounts?: AccountStore; evidence?: EvidenceStore };
  /** Tautan WhatsApp untuk tombol "Konsultasi" (opsional, hanya https). */
  whatsappUrl?: string | undefined;
}

/** Membangun aplikasi Express antarmuka web tanpa membuka port, sehingga mudah diuji dengan supertest. */
export function createWebApp({ env, db, publicContent, participantTests, audit, whatsappUrl }: WebAppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  if (env.APP_ORIGIN?.startsWith("https://")) app.set("trust proxy", 1); // di belakang reverse proxy (IP klien dan skema asli)

  // Tampilan EJS: apps/web/views.
  app.set("view engine", "ejs");
  app.set("views", path.join(WEB_ROOT, "views"));
  app.locals["fmt"] = formatDateTime;
  app.locals["fmtDate"] = formatDate;
  app.locals["percent"] = percent;
  app.locals["sessionLabel"] = SESSION_LABEL;
  app.locals["versionLabel"] = VERSION_LABEL;
  app.locals["inviteLabel"] = INVITE_LABEL;
  app.locals["classLabel"] = CLASS_LABEL;
  // Versi berkas statis (/static/*.css, *.js): berubah setiap server dimulai, memutus cache peramban.
  app.locals["assetVersion"] = String(Date.now());
  // Situs peserta ada di server yang sama (/peserta); dipakai tautan footer Auditor.
  app.locals["publicSiteUrl"] = "/peserta";
  app.locals["whatsappUrl"] = toHttpsUrl(whatsappUrl?.trim() ?? "") ?? "";

  app.use(express.json({ limit: "1mb" }));

  // API publik untuk halaman peserta (tes Pre/Post) dipasang di server yang sama agar tidak butuh CORS.
  app.use("/api/health", createHealthRouter(db));
  app.use("/api/public", createPublicRouter(publicContent));
  app.use("/api/public", createParticipantTestRouter(participantTests));

  const sec = new WebSecurity({
    secret: env.CSRF_SECRET,
    adminPassword: env.ADMIN_PASSWORD,
    auditorPassword: env.AUDITOR_PASSWORD,
    appOrigin: env.APP_ORIGIN,
    legacyEnvLogin: env.LEGACY_ENV_LOGIN,
    production: env.NODE_ENV === "production",
  });
  app.use(
    createWebRouter({
      store: audit?.store,
      admin: audit?.admin,
      accounts: audit?.accounts,
      evidence: audit?.evidence,
      legacyEnvLogin: env.LEGACY_ENV_LOGIN,
      publicContent,
      sec,
      appOrigin: env.APP_ORIGIN,
      loginEmails: {
        admin: env.ADMIN_LOGIN_EMAIL ?? "admin@sopinsya",
        auditor: env.AUDITOR_LOGIN_EMAIL ?? "auditor@sopinsya",
      },
    }),
  );

  // Rute /api yang tidak dikenal dijawab JSON.
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeInternal: env.NODE_ENV !== "production" }));

  return app;
}

import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import type { Env } from "./config/env.js";
import type { AuditStore } from "./domain/auditStore.js";
import type { PublicContentStore } from "./domain/publicContent.js";
import type { ParticipantTestStore } from "./domain/participantTest.js";
import type { PublicProgramStore, TrainingAdminStore } from "./domain/training.js";
import type { Database } from "./lib/database.js";
import { createErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createHealthRouter } from "./routes/health.js";
import { createPublicRouter } from "./routes/publicContent.js";
import { createParticipantTestRouter } from "./routes/participantTests.js";
import { createProgramRouter } from "./routes/programs.js";
import type { AdminReadStore } from "./web/adminReadStore.js";
import {
  ACCESS_LABEL,
  CLASS_LABEL,
  formatDateTime,
  percent,
  SESSION_LABEL,
  VERSION_LABEL,
} from "./web/helpers.js";
import { createWebRouter } from "./web/router.js";
import { WebSecurity } from "./web/security.js";

export interface AppDeps {
  env: Env;
  db: Database;
  /** Sumber konten publik peserta. Bila kosong, /api/public/* menjawab 503. */
  publicContent?: PublicContentStore;
  /** Pre/Post-test peserta. Bila kosong, /api/public/.../tests menjawab 503. */
  participantTests?: ParticipantTestStore;
  /** Program ISO untuk peserta (publik). Bila kosong, /api/public/programs menjawab 503. */
  programs?: PublicProgramStore;
  /** Pengelolaan program/pertemuan/tes oleh Admin. Bila kosong, halaman /admin/program menjawab 503. */
  training?: TrainingAdminStore;
  /** Penyimpanan audit untuk antarmuka web. Bila kosong, halaman Auditor/Admin menjawab 503. */
  audit?: { store: AuditStore; admin: AdminReadStore };
}

/** Membangun aplikasi Express tanpa membuka port, sehingga mudah diuji dengan supertest. */
export function createApp({ env, db, publicContent, participantTests, programs, training, audit }: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  if (env.APP_ORIGIN?.startsWith("https://")) app.set("trust proxy", 1); // di belakang reverse proxy (IP klien dan skema asli)

  // Tampilan EJS: apps/api/views (sama untuk tsx di src/ dan hasil build di dist/).
  app.set("view engine", "ejs");
  app.set("views", path.resolve(__dirname, "../views"));
  app.locals["fmt"] = formatDateTime;
  app.locals["percent"] = percent;
  app.locals["sessionLabel"] = SESSION_LABEL;
  app.locals["versionLabel"] = VERSION_LABEL;
  app.locals["accessLabel"] = ACCESS_LABEL;
  app.locals["classLabel"] = CLASS_LABEL;

  app.use(
    cors({
      origin(origin, callback) {
        // Tanpa header Origin (curl, health probe server-ke-server) diizinkan.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/health", createHealthRouter(db));
  app.use("/api/public", createPublicRouter(publicContent));
  app.use("/api/public", createParticipantTestRouter(participantTests));
  app.use("/api/public", createProgramRouter(programs));

  const sec = new WebSecurity({
    secret: env.CSRF_SECRET,
    adminPassword: env.ADMIN_PASSWORD,
    appOrigin: env.APP_ORIGIN,
    production: env.NODE_ENV === "production",
  });
  app.use(
    createWebRouter({
      store: audit?.store,
      admin: audit?.admin,
      publicContent,
      training,
      sec,
      loginEmails: { admin: env.ADMIN_LOGIN_EMAIL ?? "admin@sopinsya" },
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeInternal: env.NODE_ENV !== "production" }));

  return app;
}

import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import type { Env } from "./config/env.js";
import type { PublicContentStore } from "./domain/publicContent.js";
import type { ParticipantTestStore } from "./domain/participantTest.js";
import type { Database } from "./lib/database.js";
import { createErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createHealthRouter } from "./routes/health.js";
import { createPublicRouter } from "./routes/publicContent.js";
import { createParticipantTestRouter } from "./routes/participantTests.js";

export interface AppDeps {
  env: Env;
  db: Database;
  /** Sumber konten publik peserta. Bila kosong, /api/public/* menjawab 503. */
  publicContent?: PublicContentStore;
  /** Pre/Post-test peserta. Bila kosong, /api/public/.../tests menjawab 503. */
  participantTests?: ParticipantTestStore;
}

/**
 * Membangun aplikasi Express untuk API JSON (/api/*) tanpa membuka port, sehingga mudah diuji dengan supertest.
 * Antarmuka web (peserta, Admin, Auditor) ada di apps/web dan berjalan di port sendiri.
 */
export function createApp({ env, db, publicContent, participantTests }: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  if (env.APP_ORIGIN?.startsWith("https://")) app.set("trust proxy", 1); // di belakang reverse proxy (IP klien dan skema asli)

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
  app.use(express.static(path.resolve(__dirname, "../public")));

  app.use("/api/health", createHealthRouter(db));
  app.use("/api/public", createPublicRouter(publicContent));
  app.use("/api/public", createParticipantTestRouter(participantTests));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeInternal: env.NODE_ENV !== "production" }));

  return app;
}

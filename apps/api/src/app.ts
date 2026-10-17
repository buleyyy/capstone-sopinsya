import cors from "cors";
import express, { type Express } from "express";
import type { Env } from "./config/env.js";
import type { Database } from "./lib/database.js";
import { createErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createHealthRouter } from "./routes/health.js";

export interface AppDeps {
  env: Env;
  db: Database;
}

/** Membangun aplikasi Express tanpa membuka port, sehingga mudah diuji dengan supertest. */
export function createApp({ env, db }: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
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

  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeInternal: env.NODE_ENV !== "production" }));

  return app;
}

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { Database } from "../src/lib/database.js";

const env = loadEnv({ NODE_ENV: "test", CORS_ORIGINS: "http://localhost:3000" });

const noDb: Database = {
  configured: false,
  ping: async () => {
    throw new Error("n/a");
  },
  disconnect: async () => {},
};
const goodDb: Database = { configured: true, ping: async () => {}, disconnect: async () => {} };
const badDb: Database = {
  configured: true,
  ping: async () => {
    throw new Error("secret-host:3306 refused");
  },
  disconnect: async () => {},
};

describe("GET /api/health", () => {
  it("merespons ok walau database belum dikonfigurasi", async () => {
    const res = await request(createApp({ env, db: noDb })).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.database).toBe("not_configured");
  });
});

describe("GET /api/health/db", () => {
  it("503 DB_NOT_CONFIGURED bila DATABASE_URL kosong", async () => {
    const res = await request(createApp({ env, db: noDb })).get("/api/health/db");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: "DB_NOT_CONFIGURED" } });
  });

  it("200 connected bila ping berhasil", async () => {
    const res = await request(createApp({ env, db: goodDb })).get("/api/health/db");
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe("connected");
  });

  it("503 DB_UNAVAILABLE tanpa membocorkan detail error", async () => {
    const res = await request(createApp({ env, db: badDb })).get("/api/health/db");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("DB_UNAVAILABLE");
    expect(JSON.stringify(res.body)).not.toContain("secret-host");
  });
});

describe("error handling & CORS", () => {
  it("404 dengan format error konsisten", async () => {
    const res = await request(createApp({ env, db: noDb })).get("/api/tidak-ada");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });

  it("400 untuk JSON rusak", async () => {
    const res = await request(createApp({ env, db: noDb }))
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("CORS hanya untuk origin yang diizinkan", async () => {
    const app = createApp({ env, db: noDb });
    const allowed = await request(app).get("/api/health").set("Origin", "http://localhost:3000");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const denied = await request(app).get("/api/health").set("Origin", "http://evil.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("loadEnv", () => {
  it("DATABASE_URL kosong dianggap tidak dikonfigurasi", () => {
    expect(loadEnv({ DATABASE_URL: "" }).DATABASE_URL).toBeUndefined();
  });
  it("menolak PORT tidak valid dan DATABASE_URL non-mysql", () => {
    expect(() => loadEnv({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadEnv({ DATABASE_URL: "postgres://x@y/z" })).toThrow(/DATABASE_URL/);
  });
});

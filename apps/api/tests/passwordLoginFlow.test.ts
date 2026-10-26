import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { Database } from "../src/lib/database.js";
import type { AdminReadStore } from "../src/web/adminReadStore.js";
import { seed } from "./helpers/seed.js";

const env = loadEnv({
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:4000",
  CSRF_SECRET: "test-secret-that-is-at-least-32-characters-long",
  ADMIN_PASSWORD: "admin-password-for-tests",
  AUDITOR_PASSWORD: "auditor-password-for-tests",
  ADMIN_LOGIN_EMAIL: "admin@sopinsya",
  AUDITOR_LOGIN_EMAIL: "auditor@sopinsya",
  CORS_ORIGINS: "http://localhost:3000",
});

const db: Database = {
  configured: false,
  ping: async () => {
    throw new Error("not configured");
  },
  disconnect: async () => {},
};

async function makeApp() {
  const seeded = await seed(new Date());
  const app = createApp({
    env,
    db,
    audit: { store: seeded.store, admin: {} as AdminReadStore },
  });
  return { app, seeded };
}

describe("login berbasis email dan password", () => {
  it("Auditor masuk dengan auditor@sopinsya dan password Auditor tanpa undangan", async () => {
    const { app, seeded } = await makeApp();
    const login = await request(app)
      .post("/masuk")
      .type("form")
      .send({ email: "auditor@sopinsya", secret: "auditor-password-for-tests" })
      .expect(303);

    expect(login.headers.location).toBe("/auditor");
    const cookie = login.headers["set-cookie"]?.find((value) => value.startsWith("sopinsya_session="));
    expect(cookie).toBeDefined();

    const dashboard = await request(app).get("/auditor").set("Cookie", cookie!.split(";")[0]).expect(200);
    expect(dashboard.text).toContain("Dashboard Audit");
    expect(seeded.store.auditors.find((a) => a.id === seeded.inv1.auditor.id)?.claimedAt).toBeNull();
  });

  it("Admin hanya masuk dengan admin@sopinsya dan password Admin", async () => {
    const { app } = await makeApp();
    const login = await request(app)
      .post("/masuk")
      .type("form")
      .send({ email: "admin@sopinsya", secret: "admin-password-for-tests" })
      .expect(303);
    expect(login.headers.location).toBe("/admin");

    await request(app)
      .post("/masuk")
      .type("form")
      .send({ email: "auditor@sopinsya", secret: "admin-password-for-tests" })
      .expect(401);
  });

  it("password salah ditolak dan percobaan login tidak membuat sesi Auditor", async () => {
    const { app } = await makeApp();
    await request(app)
      .post("/masuk")
      .type("form")
      .send({ email: "auditor@sopinsya", secret: "wrong-password" })
      .expect(401);
    await request(app).get("/auditor").expect(303);
  });

  it("tautan undangan lama dialihkan ke halaman login password", async () => {
    const { app, seeded } = await makeApp();
    await request(app).get(`/undangan/${seeded.inv1.inviteToken}`).expect(303).expect("Location", "/masuk?access=password");
  });
});

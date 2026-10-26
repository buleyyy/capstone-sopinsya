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
  CORS_ORIGINS: "http://localhost:3000",
});

const db: Database = {
  configured: false,
  ping: async () => {
    throw new Error("not configured");
  },
  disconnect: async () => {},
};

describe("individual auditor invitation flow", () => {
  it("does not consume an invitation on GET, claims once, authenticates and revokes the session on logout", async () => {
    const seeded = await seed();
    const app = createApp({
      env,
      db,
      audit: { store: seeded.store, admin: {} as AdminReadStore },
    });
    const invitationPath = `/undangan/${seeded.inv1.inviteToken}`;

    const preview = await request(app).get(invitationPath).expect(200);
    expect(preview.text).toContain("Aktifkan akses audit");
    expect(preview.text).toContain("Terima undangan dan masuk");

    const activation = await request(app).post(invitationPath).expect(303);
    expect(activation.headers.location).toBe("/auditor");
    const sessionCookie = activation.headers["set-cookie"]?.find((value) => value.startsWith("sopinsya_session="));
    expect(sessionCookie).toBeDefined();
    const cookie = sessionCookie!.split(";")[0];

    // A one-time invite cannot create a second auditor session.
    await request(app).post(invitationPath).expect(404);

    const dashboard = await request(app).get("/auditor").set("Cookie", cookie).expect(200);
    expect(dashboard.text).toContain("Dashboard Audit");
    const csrf = dashboard.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
    expect(csrf).toBeTruthy();

    await request(app).post("/auditor/keluar").set("Cookie", cookie).type("form").send({ _csrf: csrf }).expect(303);
    await request(app).get("/auditor").set("Cookie", cookie).expect(303);
  });
});

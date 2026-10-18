import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createErrorHandler } from "../src/middleware/errorHandler.js";
import { SESSION_COOKIE, getAuditContext, readCookie, requireAuditor } from "../src/middleware/sessionAccess.js";
import * as admin from "../src/services/adminService.js";
import { claimInvitation } from "../src/services/auditService.js";
import { ok } from "../src/utils/response.js";
import { T0, seed } from "./helpers/seed.js";

async function setup() {
  const s = await seed();
  const app = express();
  app.get("/whoami", requireAuditor(s.store, () => T0), (_req, res) => {
    const ctx = getAuditContext(res);
    res.json(ok({ auditorId: ctx.auditorId, sessionId: ctx.sessionId }));
  });
  app.use(createErrorHandler({ exposeInternal: false }));
  const claimed = await claimInvitation(s.store, { token: s.inv1.inviteToken }, T0);
  return { s, app, cookie: `${SESSION_COOKIE}=${claimed.token}` };
}

describe("readCookie", () => {
  it("membaca cookie bernama dari beberapa cookie", () => {
    expect(readCookie("a=1; sopinsya_session=abc; b=2", "sopinsya_session")).toBe("abc");
  });
  it("undefined bila tidak ada atau header kosong", () => {
    expect(readCookie(undefined, "x")).toBeUndefined();
    expect(readCookie("a=1", "x")).toBeUndefined();
  });
});

describe("requireAuditor", () => {
  it("401 tanpa cookie", async () => {
    const { app } = await setup();
    const res = await request(app).get("/whoami");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("401 untuk token yang salah", async () => {
    const { app } = await setup();
    const res = await request(app).get("/whoami").set("Cookie", `${SESSION_COOKIE}=${"0".repeat(64)}`);
    expect(res.status).toBe(401);
  });

  it("200 dengan identitas dari database, bukan dari header yang dikirim klien", async () => {
    const { app, cookie, s } = await setup();
    const res = await request(app)
      .get("/whoami")
      .set("Cookie", cookie)
      .set("X-Auditor-Id", String(s.inv2.auditor.id))
      .set("X-Session-Id", "999");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ auditorId: s.inv1.auditor.id, sessionId: s.session.id });
  });

  it("403 SESSION_NOT_ACCESSIBLE setelah sesi ditutup tanpa jendela akses", async () => {
    const { app, cookie, s } = await setup();
    await admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0);
    const res = await request(app).get("/whoami").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SESSION_NOT_ACCESSIBLE");
  });

  it("401 setelah auditor dicabut", async () => {
    const { app, cookie, s } = await setup();
    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: s.inv1.auditor.id }, T0);
    const res = await request(app).get("/whoami").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });
});

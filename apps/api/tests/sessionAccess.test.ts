import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createErrorHandler } from "../src/middleware/errorHandler.js";
import { getAuditContext, requireAuditSession } from "../src/middleware/sessionAccess.js";
import { joinSession } from "../src/services/auditService.js";
import { MemoryStore } from "./helpers/memoryStore.js";

const CODE = "ABCD234567";
let store: MemoryStore;
let now = new Date();

function app() {
  const a = express();
  a.get("/probe", requireAuditSession(store, () => now), (_req, res) => {
    res.json(getAuditContext(res));
  });
  a.use(createErrorHandler({ exposeInternal: false }));
  return a;
}

beforeEach(() => {
  store = new MemoryStore();
  now = new Date();
  store.addDepartment(1);
  store.addDepartment(2);
});

describe("requireAuditSession", () => {
  it("401 SESSION_REQUIRED tanpa header", async () => {
    store.addSession(CODE);
    const res = await request(app()).get("/probe");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_REQUIRED");
  });

  it("200 dengan konteks dari database (departemen asal tidak bisa dipalsukan lewat request)", async () => {
    const s = store.addSession(CODE);
    const { auditor, token } = await joinSession(store, { code: CODE, name: "Budi", departmentId: 1, clientKey: "k".repeat(20) });
    const res = await request(app())
      .get("/probe?departmentId=2")
      .set("X-Session-Code", CODE.toLowerCase())
      .set("X-Auditor-Token", token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessionId: s.id, auditorId: auditor.id, departmentId: 1 });
  });

  it("token dari sesi lain ditolak (isolasi sesi)", async () => {
    store.addSession(CODE);
    store.addSession("SESI2SESI2");
    const other = await joinSession(store, { code: "SESI2SESI2", name: "Siti", departmentId: 2, clientKey: "j".repeat(20) });
    const res = await request(app()).get("/probe").set("X-Session-Code", CODE).set("X-Auditor-Token", other.token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_AUDITOR_TOKEN");
  });

  it("token lama tidak berlaku setelah join ulang (rotasi)", async () => {
    store.addSession(CODE);
    const input = { code: CODE, name: "Budi", departmentId: 1, clientKey: "k".repeat(20) };
    const first = await joinSession(store, input);
    await joinSession(store, input);
    const res = await request(app()).get("/probe").set("X-Session-Code", CODE).set("X-Auditor-Token", first.token);
    expect(res.status).toBe(401);
  });

  it("401 setelah sesi kedaluwarsa atau ditutup", async () => {
    const s = store.addSession(CODE);
    const { token } = await joinSession(store, { code: CODE, name: "Budi", departmentId: 1, clientKey: "k".repeat(20) });
    now = new Date(s.expiresAt.getTime() + 1);
    let res = await request(app()).get("/probe").set("X-Session-Code", CODE).set("X-Auditor-Token", token);
    expect(res.status).toBe(401);
    now = new Date();
    s.status = "CLOSED";
    res = await request(app()).get("/probe").set("X-Session-Code", CODE).set("X-Auditor-Token", token);
    expect(res.status).toBe(401);
  });
});

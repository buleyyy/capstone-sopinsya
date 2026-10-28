import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { Database } from "../src/lib/database.js";
import * as admin from "../src/services/adminService.js";
import type { AdminReadStore } from "../src/web/adminReadStore.js";
import { AUDITOR_PASSWORD, seed } from "./helpers/seed.js";

const env = loadEnv({
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:4000",
  CSRF_SECRET: "test-secret-that-is-at-least-32-characters-long",
  ADMIN_PASSWORD: "admin-password-for-tests",
  ADMIN_LOGIN_EMAIL: "admin@sopinsya",
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
  // Halaman Admin yang dipakai test hanya membutuhkan daftar akun; lainnya tidak disentuh.
  const adminRead = {
    listAuditorAccounts: async () => (await seeded.store.listAuditorAccounts()).map((a) => ({ ...a, sessionCount: 0 })),
  } as unknown as AdminReadStore;
  const app = createApp({ env, db, audit: { store: seeded.store, admin: adminRead } });
  return { app, seeded };
}

const login = (app: ReturnType<typeof createApp>, email: string, secret: string) =>
  request(app).post("/masuk").type("form").send({ email, secret });

const sessionCookie = (res: request.Response): string => {
  const raw: unknown = res.headers["set-cookie"];
  const cookies: string[] = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  const cookie = cookies.find((v) => v.startsWith("sopinsya_session="));
  if (!cookie) throw new Error("cookie sesi tidak ada");
  return cookie.split(";")[0] as string;
};

const csrfOf = (html: string): string => {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!m?.[1]) throw new Error("token CSRF tidak ditemukan");
  return m[1];
};

describe("login Auditor langsung (email + password individual)", () => {
  it("Auditor masuk tanpa undangan dan hanya melihat unit yang ditugaskan kepadanya", async () => {
    const { app } = await makeApp();
    const res = await login(app, "auditor1@sopinsya", AUDITOR_PASSWORD).expect(303);
    expect(res.headers.location).toBe("/auditor");

    const dash = await request(app).get("/auditor").set("Cookie", sessionCookie(res)).expect(200);
    expect(dash.text).toContain("Dashboard Audit");
    expect(dash.text).toContain("Unit B");
    expect(dash.text).not.toContain("Unit A");
  });

  it("email tidak peka huruf besar/kecil", async () => {
    const { app } = await makeApp();
    await login(app, "  Auditor2@SOPINSYA ", AUDITOR_PASSWORD).expect(303);
  });

  it("kata sandi salah, email tidak dikenal, dan akun nonaktif: respons 401 yang sama tanpa cookie", async () => {
    const { app, seeded } = await makeApp();
    await admin.setAuditorAccountActive(seeded.store, { accountId: seeded.acc2.id, isActive: false });
    const bodies: string[] = [];
    for (const [email, pw] of [
      ["auditor1@sopinsya", "salah-total"],
      ["tidak-ada@sopinsya", AUDITOR_PASSWORD],
      ["auditor2@sopinsya", AUDITOR_PASSWORD],
    ] as const) {
      const res = await login(app, email, pw).expect(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
      bodies.push(/Email atau kata sandi tidak sesuai\./.exec(res.text)?.[0] ?? "");
    }
    expect(bodies).toEqual(Array(3).fill("Email atau kata sandi tidak sesuai."));
  });

  it("satu gerbang untuk dua role: Admin ke /admin; kata sandi tidak dapat ditukar antar role", async () => {
    const { app } = await makeApp();
    const a = await login(app, "admin@sopinsya", "admin-password-for-tests").expect(303);
    expect(a.headers.location).toBe("/admin");
    await login(app, "auditor1@sopinsya", "admin-password-for-tests").expect(401);
    await login(app, "admin@sopinsya", AUDITOR_PASSWORD).expect(401);
  });

  it("tidak ada route atau mekanisme undangan: /undangan/* menghasilkan 404", async () => {
    const { app } = await makeApp();
    await request(app).get(`/undangan/${"a".repeat(64)}`).expect(404);
    const page = await request(app).get("/masuk").expect(200);
    expect(page.text.toLowerCase()).not.toContain("undangan");
  });
});

describe("otorisasi Auditor di sisi server", () => {
  it("penugasan milik auditor lain dijawab 404 meski ID diketahui", async () => {
    const { app, seeded } = await makeApp();
    const cookie = sessionCookie(await login(app, "auditor1@sopinsya", AUDITOR_PASSWORD).expect(303));
    await request(app).get(`/auditor/penugasan/${seeded.assign1.id}`).set("Cookie", cookie).expect(200);
    await request(app).get(`/auditor/penugasan/${seeded.assign2.id}`).set("Cookie", cookie).expect(404);
  });

  it("POST tanpa token CSRF ditolak dan tidak mengubah data", async () => {
    const { app, seeded } = await makeApp();
    const cookie = sessionCookie(await login(app, "auditor1@sopinsya", AUDITOR_PASSWORD).expect(303));
    const res = await request(app)
      .post(`/auditor/penugasan/${seeded.assign1.id}`)
      .set("Cookie", cookie)
      .type("form")
      .send({});
    expect(res.status).toBe(403);
    expect(seeded.store.answers).toHaveLength(0);
  });

  it("tanpa cookie, area Auditor tidak dapat diakses", async () => {
    const { app } = await makeApp();
    const res = await request(app).get("/auditor");
    expect([303, 401]).toContain(res.status);
  });

  it("akun dinonaktifkan Admin: cookie lama langsung tidak berlaku", async () => {
    const { app, seeded } = await makeApp();
    const cookie = sessionCookie(await login(app, "auditor1@sopinsya", AUDITOR_PASSWORD).expect(303));
    await request(app).get("/auditor").set("Cookie", cookie).expect(200);
    await admin.setAuditorAccountActive(seeded.store, { accountId: seeded.acc1.id, isActive: false });
    const res = await request(app).get("/auditor").set("Cookie", cookie);
    expect(res.status).not.toBe(200);
  });

  it("keanggotaan dicabut: login tetap sah tetapi halaman penugasan 403 dan dashboard kosong", async () => {
    const { app, seeded } = await makeApp();
    const cookie = sessionCookie(await login(app, "auditor1@sopinsya", AUDITOR_PASSWORD).expect(303));
    await admin.revokeAuditor(seeded.store, { sessionId: seeded.session.id, auditorId: seeded.aud1.id });
    const dash = await request(app).get("/auditor").set("Cookie", cookie).expect(200);
    expect(dash.text).toContain("Belum ada penugasan");
    await request(app).get(`/auditor/penugasan/${seeded.assign1.id}`).set("Cookie", cookie).expect(403);
  });

  it("akun tanpa sesi dapat login, melihat halaman kosong, tetapi tidak membuka penugasan siapa pun", async () => {
    const { app, seeded } = await makeApp();
    await admin.createAuditorAccount(seeded.store, { name: "Tanpa Sesi", email: "kosong@sopinsya", password: "kata-sandi-kosong-1" });
    const cookie = sessionCookie(await login(app, "kosong@sopinsya", "kata-sandi-kosong-1").expect(303));
    const dash = await request(app).get("/auditor").set("Cookie", cookie).expect(200);
    expect(dash.text).toContain("Belum ada penugasan");
    await request(app).get(`/auditor/penugasan/${seeded.assign1.id}`).set("Cookie", cookie).expect(403);
  });
});

describe("Admin membuat akun, menambah ke sesi, dan menugaskan unit langsung dari halaman administrasi", () => {
  it("alur lengkap tanpa token: auditor baru login dan langsung melihat unit yang ditugaskan", async () => {
    const { app, seeded } = await makeApp();
    const agent = request.agent(app);
    await agent.post("/masuk").type("form").send({ email: "admin@sopinsya", secret: "admin-password-for-tests" }).expect(303);

    const page = await agent.get("/admin/auditor").expect(200);
    await agent
      .post("/admin/auditor")
      .type("form")
      .send({ _csrf: csrfOf(page.text), name: "Dewi", email: "Dewi@Sopinsya", password: "kata-sandi-dewi-1" })
      .expect(303);
    const account = seeded.store.accounts.find((a) => a.email === "dewi@sopinsya");
    expect(account).toBeDefined();
    expect(account?.passwordHash).not.toContain("kata-sandi-dewi-1");

    await agent
      .post(`/admin/sesi/${seeded.session.id}/auditor`)
      .type("form")
      .send({ _csrf: csrfOf(page.text), accountId: String(account?.id), exclude: String(seeded.deptB.id) })
      .expect(303);
    const member = seeded.store.auditors.find((a) => a.accountId === account?.id);
    expect(member).toBeDefined();

    await agent
      .post(`/admin/sesi/${seeded.session.id}/penugasan`)
      .type("form")
      .send({ _csrf: csrfOf(page.text), auditorId: String(member?.id), departmentId: String(seeded.deptA.id) })
      .expect(303);

    const dewi = sessionCookie(await login(app, "dewi@sopinsya", "kata-sandi-dewi-1").expect(303));
    const dash = await request(app).get("/auditor").set("Cookie", dewi).expect(200);
    expect(dash.text).toContain("Unit A");
    expect(dash.text).not.toContain("Unit B");
  });

  it("penugasan ke unit yang dilarang bagi auditor itu ditolak oleh server", async () => {
    const { app, seeded } = await makeApp();
    const agent = request.agent(app);
    await agent.post("/masuk").type("form").send({ email: "admin@sopinsya", secret: "admin-password-for-tests" }).expect(303);
    const page = await agent.get("/admin/auditor").expect(200);
    const res = await agent
      .post(`/admin/sesi/${seeded.session.id}/penugasan`)
      .type("form")
      .send({ _csrf: csrfOf(page.text), auditorId: String(seeded.aud1.id), departmentId: String(seeded.deptA.id) });
    expect(res.status).toBe(422);
    expect(seeded.store.assignments).toHaveLength(2);
  });

  it("email Admin tidak dapat dipakai untuk akun Auditor; Auditor tidak dapat membuka /admin", async () => {
    const { app } = await makeApp();
    const agent = request.agent(app);
    await agent.post("/masuk").type("form").send({ email: "admin@sopinsya", secret: "admin-password-for-tests" }).expect(303);
    const page = await agent.get("/admin/auditor").expect(200);
    const res = await agent
      .post("/admin/auditor")
      .type("form")
      .send({ _csrf: csrfOf(page.text), name: "X", email: "admin@sopinsya", password: "kata-sandi-x-123" });
    expect(res.status).toBe(422);

    const auditorCookie = sessionCookie(await login(app, "auditor1@sopinsya", AUDITOR_PASSWORD).expect(303));
    const denied = await request(app).get("/admin/auditor").set("Cookie", auditorCookie);
    expect(denied.status).not.toBe(200);
  });
});

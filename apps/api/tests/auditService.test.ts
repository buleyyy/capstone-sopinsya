import { beforeEach, describe, expect, it } from "vitest";
import { createAssignment, createFinding, joinSession, saveAnswer, type AuditContext } from "../src/services/auditService.js";
import { MemoryStore } from "./helpers/memoryStore.js";

const CODE = "ABCD234567";
const key = (n: string) => `client-key-${n}-0123456789abcdef`;

async function expectAppError(p: Promise<unknown>, status: number, code: string) {
  await expect(p).rejects.toMatchObject({ statusCode: status, code });
}

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.addDepartment(1); // IT
  store.addDepartment(2); // HR
  store.addItem(10, 1);
  store.addItem(20, 2);
});

async function join(name: string, departmentId: number, clientKey: string, code = CODE) {
  return joinSession(store, { code, name, departmentId, clientKey });
}
const ctxOf = (a: { id: number; sessionId: number; departmentId: number }): AuditContext => ({
  sessionId: a.sessionId, auditorId: a.id, departmentId: a.departmentId,
});

describe("joinSession", () => {
  it("menolak kode salah, kedaluwarsa, dan sesi bukan ACTIVE dengan pesan yang sama", async () => {
    store.addSession(CODE);
    store.addSession("EXPIRED222", { expiresAt: new Date(Date.now() - 1000) });
    store.addSession("CLOSED2222", { status: "CLOSED" });
    for (const code of ["SALAHSALAH", "EXPIRED222", "CLOSED2222"]) {
      await expectAppError(join("Budi", 1, key("a"), code), 401, "INVALID_SESSION_CODE");
    }
  });

  it("kode sesi tidak sensitif huruf besar/kecil dan spasi", async () => {
    store.addSession(CODE);
    const r = await join("Budi", 1, key("a"), `  ${CODE.toLowerCase()} `);
    expect(r.auditor.id).toBeGreaterThan(0);
  });

  it("nama BUKAN identitas: dua orang bernama sama menjadi dua auditor berbeda", async () => {
    store.addSession(CODE);
    const a = await join("Budi", 1, key("a"));
    const b = await join("Budi", 1, key("b"));
    expect(a.auditor.id).not.toBe(b.auditor.id);
    expect(store.auditors).toHaveLength(2);
  });

  it("join ulang dengan kunci perangkat sama tidak menggandakan auditor dan merotasi token", async () => {
    store.addSession(CODE);
    const first = await join("Budi", 1, key("a"));
    const again = await join("Budi", 1, key("a"));
    expect(again.auditor.id).toBe(first.auditor.id);
    expect(store.auditors).toHaveLength(1);
    expect(again.token).not.toBe(first.token);
  });

  it("kunci perangkat sama tidak bisa dipakai mengganti departemen asal", async () => {
    store.addSession(CODE);
    await join("Budi", 1, key("a"));
    await expectAppError(join("Budi", 2, key("a")), 409, "CLIENT_KEY_CONFLICT");
  });

  it("menolak departemen yang tidak ada dan input tidak valid", async () => {
    store.addSession(CODE);
    await expectAppError(join("Budi", 99, key("a")), 422, "DEPARTMENT_NOT_FOUND");
    await expectAppError(join("", 1, key("a")), 422, "VALIDATION_ERROR");
    await expectAppError(join("Budi", 1, "pendek"), 422, "VALIDATION_ERROR");
  });
});

describe("createAssignment: larangan audit departemen sendiri", () => {
  it("menolak departemen asal sendiri (422 SELF_AUDIT_FORBIDDEN)", async () => {
    store.addSession(CODE);
    const { auditor } = await join("Budi", 1, key("a"));
    await expectAppError(createAssignment(store, ctxOf(auditor), { departmentId: 1 }), 422, "SELF_AUDIT_FORBIDDEN");
    expect(store.assignments).toHaveLength(0);
  });

  it("mengizinkan departemen lain dan bersifat idempoten", async () => {
    store.addSession(CODE);
    const { auditor } = await join("Budi", 1, key("a"));
    const a1 = await createAssignment(store, ctxOf(auditor), { departmentId: 2 });
    const a2 = await createAssignment(store, ctxOf(auditor), { departmentId: 2 });
    expect(a2.id).toBe(a1.id);
    expect(store.assignments).toHaveLength(1);
  });

  it("memakai departemen asal dari konteks (database), bukan dari body", async () => {
    store.addSession(CODE);
    const { auditor } = await join("Budi", 1, key("a"));
    const sneaky = { departmentId: 1, auditorDepartmentId: 2 };
    await expectAppError(createAssignment(store, ctxOf(auditor), sneaky), 422, "SELF_AUDIT_FORBIDDEN");
  });
});

describe("saveAnswer", () => {
  async function setup() {
    store.addSession(CODE);
    const { auditor } = await join("Budi", 1, key("a")); // asal IT
    const ctx = ctxOf(auditor);
    const assignment = await createAssignment(store, ctx, { departmentId: 2 }); // mengaudit HR
    return { ctx, assignment };
  }

  it("menyimpan lalu menimpa jawaban yang sama (satu baris per item)", async () => {
    const { ctx, assignment } = await setup();
    await saveAnswer(store, ctx, assignment.id, { itemId: 20, progress: "DALAM_PROSES", note: "cek" });
    const final = await saveAnswer(store, ctx, assignment.id, { itemId: 20, progress: "SELESAI", result: "TIDAK" });
    expect(store.answers).toHaveLength(1);
    expect(final).toMatchObject({ result: "TIDAK", progress: "SELESAI", departmentId: 2 });
  });

  it("menolak item dari departemen lain (422 ITEM_DEPARTMENT_MISMATCH) dan item yang tidak ada", async () => {
    const { ctx, assignment } = await setup();
    await expectAppError(saveAnswer(store, ctx, assignment.id, { itemId: 10, progress: "DALAM_PROSES" }), 422, "ITEM_DEPARTMENT_MISMATCH");
    await expectAppError(saveAnswer(store, ctx, assignment.id, { itemId: 999, progress: "DALAM_PROSES" }), 422, "ITEM_DEPARTMENT_MISMATCH");
  });

  it("penugasan auditor lain dalam sesi yang sama dijawab 404", async () => {
    const { assignment } = await setup();
    const other = await join("Siti", 1, key("b"));
    await expectAppError(
      saveAnswer(store, ctxOf(other.auditor), assignment.id, { itemId: 20, progress: "DALAM_PROSES" }),
      404, "NOT_FOUND",
    );
  });

  it("isolasi sesi: penugasan di sesi lain dijawab 404 walau auditornya punya id sama", async () => {
    const { assignment } = await setup();
    store.addSession("SESI2SESI2");
    const other = await joinSession(store, { code: "SESI2SESI2", name: "Budi", departmentId: 1, clientKey: key("z") });
    await expectAppError(
      saveAnswer(store, ctxOf(other.auditor), assignment.id, { itemId: 20, progress: "DALAM_PROSES" }),
      404, "NOT_FOUND",
    );
  });
});

describe("createFinding", () => {
  async function setup() {
    store.addSession(CODE);
    const { auditor } = await join("Budi", 1, key("a"));
    const ctx = ctxOf(auditor);
    const hr = await createAssignment(store, ctx, { departmentId: 2 });
    const answer = await saveAnswer(store, ctx, hr.id, { itemId: 20, progress: "SELESAI", result: "TIDAK" });
    return { ctx, hr, answer };
  }
  const plor = { classification: "MAJOR", problem: "SOP tidak ada", location: "Ruang HR", objectiveEvidence: "Tidak ditunjukkan", reference: "ISO 37001 7.3" };

  it("menyimpan temuan dari jawaban pada penugasan yang sama, maupun berdiri sendiri", async () => {
    const { ctx, hr, answer } = await setup();
    const linked = await createFinding(store, ctx, hr.id, { ...plor, answerId: answer.id });
    const standalone = await createFinding(store, ctx, hr.id, plor);
    expect(linked).toMatchObject({ assignmentId: hr.id, answerId: answer.id });
    expect(standalone.answerId).toBeNull();
  });

  it("menolak answerId milik penugasan lain (422 ANSWER_ASSIGNMENT_MISMATCH)", async () => {
    const { ctx, answer } = await setup();
    store.addDepartment(3);
    store.addItem(30, 3);
    const other = await createAssignment(store, ctx, { departmentId: 3 });
    await expectAppError(createFinding(store, ctx, other.id, { ...plor, answerId: answer.id }), 422, "ANSWER_ASSIGNMENT_MISMATCH");
    expect(store.findings).toHaveLength(0);
  });

  it("menolak PLOR tidak lengkap dan klasifikasi tidak dikenal", async () => {
    const { ctx, hr } = await setup();
    await expectAppError(createFinding(store, ctx, hr.id, { ...plor, location: "" }), 422, "VALIDATION_ERROR");
    await expectAppError(createFinding(store, ctx, hr.id, { ...plor, classification: "FATAL" }), 422, "VALIDATION_ERROR");
  });
});

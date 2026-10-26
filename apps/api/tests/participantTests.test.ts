import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import {
  computeScore,
  gradeAttempt,
  type AttemptResult,
  type GradingKey,
  type ParticipantTestStore,
  type PublicTest,
} from "../src/domain/participantTest.js";
import { createDatabase } from "../src/lib/database.js";

const LABELS = ["A", "B", "C", "D"];
const TOTAL = 10;

/** 10 soal; soal ke-i punya opsi id (i*10+1..4) dan kunci = opsi urutan (i % 4). */
function buildFixture() {
  const test: PublicTest = {
    id: 1,
    title: "Pre-test ISO 37001: 2025",
    type: "PRE",
    questions: Array.from({ length: TOTAL }, (_, i) => ({
      id: i + 1,
      orderNo: i + 1,
      text: `Soal ${i + 1}`,
      options: LABELS.map((label, oi) => ({ id: (i + 1) * 10 + oi + 1, label, text: `Opsi ${label}` })),
    })),
  };
  const key: GradingKey = {
    testId: 1,
    questions: test.questions.map((q, i) => ({
      id: q.id,
      optionIds: q.options.map((o) => o.id),
      correctOptionId: q.options[i % 4]!.id,
    })),
  };
  return { test, key };
}

function memoryStore() {
  const { test, key } = buildFixture();
  const attempts = new Map<string, AttemptResult>();
  const store: ParticipantTestStore = {
    async getTest(slug, meetingNo, type) {
      return slug === "iso-37001" && meetingNo === 1 && type === "PRE" ? test : null;
    },
    async getGradingKey(testId) {
      return testId === 1 ? key : null;
    },
    async findAttempt(testId, clientRequestId) {
      return attempts.get(`${testId}:${clientRequestId}`) ?? null;
    },
    async saveAttempt(testId, input, graded) {
      const result: AttemptResult = { attemptId: attempts.size + 1, ...graded };
      attempts.set(`${testId}:${input.clientRequestId}`, result);
      return result;
    },
  };
  return { store, key, test, attempts };
}

const env = loadEnv({ NODE_ENV: "test" });
const makeApp = (store?: ParticipantTestStore) =>
  createApp({ env, db: createDatabase(undefined), ...(store ? { participantTests: store } : {}) });

const identity = { participantName: "Budi Santoso", participantInstitution: "BBWS Ciliwung Cisadane" };

/** Jawaban benar untuk soal 1..nCorrect, sisanya sengaja salah atau kosong. */
function answersFor(key: GradingKey, nCorrect: number, rest: "wrong" | "blank") {
  return key.questions.map((q, i) => {
    if (i < nCorrect) return { questionId: q.id, optionId: q.correctOptionId };
    if (rest === "blank") return { questionId: q.id, optionId: null };
    return { questionId: q.id, optionId: q.optionIds.find((id) => id !== q.correctOptionId)! };
  });
}

describe("computeScore / gradeAttempt", () => {
  it("2 benar dari 10 soal = skor 20 (sesuai desain)", () => {
    expect(computeScore(2, 10)).toBe(20);
    const { key } = buildFixture();
    const graded = gradeAttempt(key, answersFor(key, 2, "wrong"));
    expect(graded.correctCount).toBe(2);
    expect(graded.score).toBe(20);
  });

  it("semua benar = 100, tanpa soal = 0", () => {
    const { key } = buildFixture();
    expect(gradeAttempt(key, answersFor(key, TOTAL, "wrong")).score).toBe(100);
    expect(computeScore(0, 0)).toBe(0);
  });

  it("soal yang tidak dikirim atau optionId null dihitung salah", () => {
    const { key } = buildFixture();
    expect(gradeAttempt(key, answersFor(key, 3, "blank")).correctCount).toBe(3);
    expect(gradeAttempt(key, []).correctCount).toBe(0);
  });

  it("menolak soal asing, opsi milik soal lain, dan soal ganda", () => {
    const { key } = buildFixture();
    expect(() => gradeAttempt(key, [{ questionId: 999, optionId: null }])).toThrow(/bukan bagian/);
    expect(() => gradeAttempt(key, [{ questionId: 1, optionId: key.questions[1]!.optionIds[0]! }])).toThrow(/bukan milik soalnya/);
    expect(() =>
      gradeAttempt(key, [
        { questionId: 1, optionId: null },
        { questionId: 1, optionId: null },
      ]),
    ).toThrow(/satu kali/);
  });
});

describe("GET /api/public/programs/:slug/pertemuan/:n/tests/:type", () => {
  it("mengembalikan soal tanpa kunci jawaban", async () => {
    const res = await request(makeApp(memoryStore().store)).get("/api/public/programs/iso-37001/pertemuan/1/tests/pre");
    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(TOTAL);
    expect(res.body.data.questions[0].options).toHaveLength(4);
    expect(JSON.stringify(res.body)).not.toMatch(/isCorrect|correctOptionId|answer/i);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("404 untuk tes tidak ada, jenis tidak valid, nomor atau slug tidak valid", async () => {
    const app = makeApp(memoryStore().store);
    for (const path of [
      "/api/public/programs/iso-37001/pertemuan/1/tests/post",
      "/api/public/programs/iso-37001/pertemuan/1/tests/lain",
      "/api/public/programs/iso-37001/pertemuan/0/tests/pre",
      "/api/public/programs/iso-37001/pertemuan/abc/tests/pre",
      "/api/public/programs/ISO_37001/pertemuan/1/tests/pre",
    ]) {
      expect((await request(app).get(path)).status).toBe(404);
    }
  });

  it("503 DB_NOT_CONFIGURED bila sumber data belum ada", async () => {
    const res = await request(makeApp()).get("/api/public/programs/iso-37001/pertemuan/1/tests/pre");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("DB_NOT_CONFIGURED");
  });
});

describe("POST /api/public/tests/:testId/attempts", () => {
  it("menilai di server dan mengembalikan skor serta hasil per soal", async () => {
    const { store, key } = memoryStore();
    const res = await request(makeApp(store))
      .post("/api/public/tests/1/attempts")
      .send({ ...identity, clientRequestId: "req-00000001", answers: answersFor(key, 2, "wrong") });
    expect(res.status).toBe(201);
    expect(res.body.data.correctCount).toBe(2);
    expect(res.body.data.totalQuestions).toBe(TOTAL);
    expect(res.body.data.score).toBe(20);
    expect(res.body.data.results).toHaveLength(TOTAL);
    expect(res.body.data.results.filter((r: { correct: boolean }) => r.correct)).toHaveLength(2);
  });

  it("soal kosong dihitung salah", async () => {
    const { store, key } = memoryStore();
    const res = await request(makeApp(store))
      .post("/api/public/tests/1/attempts")
      .send({ ...identity, clientRequestId: "req-00000002", answers: answersFor(key, 4, "blank") });
    expect(res.status).toBe(201);
    expect(res.body.data.score).toBe(40);
  });

  it("kirim ganda dengan clientRequestId sama hanya menyimpan satu percobaan", async () => {
    const { store, key, attempts } = memoryStore();
    const app = makeApp(store);
    const body = { ...identity, clientRequestId: "req-00000003", answers: answersFor(key, 5, "wrong") };
    const first = await request(app).post("/api/public/tests/1/attempts").send(body);
    const second = await request(app).post("/api/public/tests/1/attempts").send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.attemptId).toBe(first.body.data.attemptId);
    expect(attempts.size).toBe(1);
  });

  it("menolak nama atau instansi kosong dan clientRequestId tidak valid", async () => {
    const { store, key } = memoryStore();
    const app = makeApp(store);
    const base = { ...identity, clientRequestId: "req-00000004", answers: answersFor(key, 1, "blank") };
    expect((await request(app).post("/api/public/tests/1/attempts").send({ ...base, participantName: "   " })).status).toBe(400);
    expect((await request(app).post("/api/public/tests/1/attempts").send({ ...base, participantInstitution: "" })).status).toBe(400);
    expect((await request(app).post("/api/public/tests/1/attempts").send({ ...base, clientRequestId: "x" })).status).toBe(400);
  });

  it("menolak jawaban dengan soal/opsi asing dan memberi 404 untuk tes tidak ada", async () => {
    const { store, key } = memoryStore();
    const app = makeApp(store);
    const bad = await request(app)
      .post("/api/public/tests/1/attempts")
      .send({ ...identity, clientRequestId: "req-00000005", answers: [{ questionId: 999, optionId: null }] });
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .post("/api/public/tests/42/attempts")
      .send({ ...identity, clientRequestId: "req-00000006", answers: answersFor(key, 1, "blank") });
    expect(missing.status).toBe(404);
  });

  it("503 bila sumber data belum ada", async () => {
    const res = await request(makeApp())
      .post("/api/public/tests/1/attempts")
      .send({ ...identity, clientRequestId: "req-00000007", answers: [] });
    expect(res.status).toBe(503);
  });
});

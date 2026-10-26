import { Router } from "express";
import { z } from "zod";
import {
  gradeAttempt,
  type ParticipantTestStore,
  type SubmitAttemptInput,
  type TestKind,
} from "../domain/participantTest.js";
import { AppError } from "../utils/errors.js";
import { ok } from "../utils/response.js";

const SLUG = /^[a-z0-9-]{1,80}$/;

const attemptBody = z.object({
  participantName: z.string().trim().min(1, "Nama wajib diisi").max(120),
  participantInstitution: z.string().trim().min(1, "Instansi wajib diisi").max(160),
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "clientRequestId tidak valid"),
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        optionId: z.number().int().positive().nullable(),
      }),
    )
    .max(200),
});

function parseKind(value: string | undefined): TestKind | null {
  if (value === "pre") return "PRE";
  if (value === "post") return "POST";
  return null;
}

/**
 * Rute publik Pre-test/Post-test (tanpa login):
 *  GET  /api/public/programs/:slug/pertemuan/:n/tests/:type   soal tanpa kunci jawaban
 *  POST /api/public/tests/:testId/attempts                    kirim jawaban, terima hasil dari server
 */
export function createParticipantTestRouter(store: ParticipantTestStore | undefined): Router {
  const router = Router();

  const requireStore = (): ParticipantTestStore => {
    if (!store) throw new AppError(503, "DB_NOT_CONFIGURED", "Data belum tersedia (database belum dikonfigurasi)");
    return store;
  };

  router.get("/programs/:slug/pertemuan/:n/tests/:type", async (req, res) => {
    const s = requireStore();
    const slug = String(req.params["slug"]);
    const meetingNo = Number(req.params["n"]);
    const kind = parseKind(req.params["type"]);
    if (!SLUG.test(slug) || !Number.isInteger(meetingNo) || meetingNo < 1 || meetingNo > 50 || !kind) {
      throw new AppError(404, "NOT_FOUND", "Tes tidak ditemukan");
    }
    const test = await s.getTest(slug, meetingNo, kind);
    if (!test) throw new AppError(404, "NOT_FOUND", "Tes tidak ditemukan");
    res.set("Cache-Control", "no-store");
    res.json(ok(test));
  });

  router.post("/tests/:testId/attempts", async (req, res) => {
    const s = requireStore();
    const testId = Number(req.params["testId"]);
    if (!Number.isInteger(testId) || testId < 1) throw new AppError(404, "NOT_FOUND", "Tes tidak ditemukan");

    const parsed = attemptBody.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new AppError(400, "VALIDATION_ERROR", first?.message ?? "Data tidak valid", parsed.error.issues);
    }
    const input: SubmitAttemptInput = parsed.data;

    // Klik Selesai ganda / kirim ulang setelah koneksi putus: kembalikan percobaan yang sama.
    const existing = await s.findAttempt(testId, input.clientRequestId);
    if (existing) {
      res.set("Cache-Control", "no-store");
      res.status(200).json(ok(existing));
      return;
    }

    const key = await s.getGradingKey(testId);
    if (!key || key.questions.length === 0) throw new AppError(404, "NOT_FOUND", "Tes tidak ditemukan");

    const graded = gradeAttempt(key, input.answers);
    const saved = await s.saveAttempt(testId, input, graded);
    res.set("Cache-Control", "no-store");
    res.status(201).json(ok(saved));
  });

  return router;
}

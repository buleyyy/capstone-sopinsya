import type { Request, RequestHandler, Response, Router } from "express";
import { z } from "zod";
import { parseInput } from "../../api/src/domain/auditSchemas.js";
import { AppError } from "../../api/src/utils/errors.js";
import { requireAdminStore, type WebDeps } from "../shared/deps.js";
import { fileUrl, headerFileName, jsonUpload, PUBLIC_FILE_PATH, rawUpload, validateUpload } from "../shared/files.js";
import { intField, intParam, trimmed } from "../shared/helpers.js";
import {
  evaluateProgramReadiness,
  type MeetingResourceKind,
  type ProgramDetailRow,
  type ProgramInput,
  type ProgramStatus,
} from "./readStore.js";

/**
 * Kelola Konten Program (mockup Figma "Kelola Konten Program"): satu halaman per program berisi Informasi Program,
 * Materi & Konten Pembelajaran (per pertemuan), Pre-test, Post-test, dan Rating & Ulasan. Data dari Course Builder
 * (TrainingProgram/ProgramMeeting/MeetingResource) yang juga dibaca katalog peserta, jadi perubahan langsung tampil.
 * Dipasang di dalam createAdminRouter sehingga gerbang login Admin berlaku.
 */

const RESOURCE_KINDS = ["SYLLABUS", "MATERIAL", "CASE_STUDY", "VIDEO", "BLOOKET", "SOP"] as const satisfies readonly MeetingResourceKind[];
const STATUSES = ["PUBLISHED", "ARCHIVED", "DRAFT"] as const satisfies readonly ProgramStatus[];

const httpsOnly = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
};

/** Tautan konten: https:// tanpa kredensial, atau berkas yang diunggah Admin (/berkas/<id>/<nama>). */
const linkOrFile = (v: string): boolean => httpsOnly(v) || PUBLIC_FILE_PATH.test(v);

const programSchema = z.object({
  coverUrl: z.string().trim().max(255).refine((v) => v === "" || PUBLIC_FILE_PATH.test(v), "Sampul harus berupa gambar yang diunggah"),
  title: z.string().trim().min(1, "Nama program wajib diisi").max(160),
  category: z.string().trim().max(160),
  description: z.string().trim().max(8000),
  trainer: z.string().trim().min(1, "Nama trainer wajib diisi").max(160),
  status: z.enum(STATUSES),
  slug: z.string().trim().max(80).regex(/^[a-z0-9-]*$/, "Slug hanya huruf kecil, angka, dan tanda hubung"),
  code: z.string().trim().max(40),
  subtitle: z.string().trim().max(200),
  summary: z.string().trim().max(1000),
  duration: z.string().trim().max(80),
  mode: z.string().trim().max(80),
  sortOrder: z.number().int().min(0).max(100000),
});

const resourceSchema = z.object({
  meeting: z.string().regex(/^(new|\d{1,9})$/),
  type: z.enum(RESOURCE_KINDS),
  title: z.string().trim().min(1, "Judul wajib diisi").max(255),
  url: z.string().trim().min(1, "Tautan atau berkas wajib diisi").max(1024).refine(linkOrFile, "Tautan harus https:// tanpa kredensial, atau unggah berkas"),
  sortOrder: z.number().int().min(0).max(100000),
});

const testSchema = z.object({
  meetingNo: z.number().int().min(1).max(50),
  title: z.string().trim().min(1, "Judul evaluasi wajib diisi").max(160),
  instructions: z.string().trim().max(4000),
  isActive: z.boolean(),
  shuffleQuestions: z.boolean(),
});

export const slugify = (v: string): string =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Satu soal per baris: `pertanyaan | A | B | C | D | kunci` (atau dipisah TAB). Pilihan C/D boleh kosong. */
export function parseQuestionLines(raw: string): { text: string; options: { label: string; text: string; isCorrect: boolean }[] }[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  if (lines.length === 0) throw new AppError(422, "VALIDATION_ERROR", "Isi berkas kosong: tempel minimal satu baris soal.");
  if (lines.length > 200) throw new AppError(422, "VALIDATION_ERROR", "Maksimal 200 soal per impor.");
  const errors: string[] = [];
  const out = lines.map((line, i) => {
    const parts = (line.includes("\t") ? line.split("\t") : line.split("|")).map((p) => p.trim());
    const key = (parts.pop() ?? "").toUpperCase();
    const [text = "", ...opts] = parts;
    const options = opts.slice(0, 4).map((t, j) => ({ label: "ABCD"[j] ?? "", text: t })).filter((o) => o.text !== "");
    if (text === "" || text.length > 4000) errors.push(`baris ${i + 1}: pertanyaan kosong atau terlalu panjang`);
    else if (options.length < 2) errors.push(`baris ${i + 1}: minimal dua pilihan jawaban`);
    else if (options.some((o) => o.text.length > 500)) errors.push(`baris ${i + 1}: pilihan maksimal 500 karakter`);
    else if (!options.some((o) => o.label === key)) errors.push(`baris ${i + 1}: kunci "${key}" bukan salah satu pilihan yang diisi`);
    return { text, options: options.map((o) => ({ ...o, isCorrect: o.label === key })) };
  });
  if (errors.length > 0) throw new AppError(422, "VALIDATION_ERROR", `Impor dibatalkan, tidak ada soal yang disimpan. Periksa ${errors.slice(0, 5).join("; ")}.`);
  return out;
}

export function registerProgramRoutes(router: Router, deps: WebDeps): void {
  const store = () => requireAdminStore(deps);

  const loadProgram = async (req: Request): Promise<ProgramDetailRow> => {
    const program = await store().getProgram(intParam(req.params["id"]));
    if (!program) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
    return program;
  };

  const readProgramForm = (req: Request) => {
    const sort = intField(req, "sortOrder");
    return parseInput(programSchema, {
      coverUrl: trimmed(req, "coverUrl"),
      title: trimmed(req, "title"),
      category: trimmed(req, "category"),
      description: trimmed(req, "description"),
      trainer: trimmed(req, "trainer"),
      status: trimmed(req, "status") || "DRAFT",
      slug: trimmed(req, "slug").toLowerCase(),
      code: trimmed(req, "code"),
      subtitle: trimmed(req, "subtitle"),
      summary: trimmed(req, "summary"),
      duration: trimmed(req, "duration"),
      mode: trimmed(req, "mode"),
      sortOrder: Number.isNaN(sort) ? 0 : sort,
    });
  };

  /** Isian lanjutan yang dikosongkan memakai nilai lama (ubah) atau turunan dari nama program (baru). */
  const toInput = (f: ReturnType<typeof readProgramForm>, prev: ProgramDetailRow | null): ProgramInput => ({
    slug: f.slug || prev?.slug || slugify(f.title),
    code: f.code || prev?.code || f.title.split(":")[0]!.trim().slice(0, 40),
    title: f.title,
    fullTitle: f.title,
    subtitle: f.subtitle || f.category || prev?.subtitle || "",
    summary: f.summary || f.description.slice(0, 300),
    description: f.description,
    duration: f.duration || prev?.duration || "2 pertemuan",
    mode: f.mode || prev?.mode || "Daring",
    trainer: f.trainer,
    category: f.category,
    tone: prev?.tone ?? "blue",
    sortOrder: f.sortOrder,
    coverUrl: f.coverUrl || null,
  });

  const render = async (res: Response, program: ProgramDetailRow | null, o: { saved?: boolean; notice?: string } = {}) => {
    const admin = store();
    const [tests, questions, reviews] = await Promise.all([
      admin.listTrainingTests(),
      admin.listTrainingQuestions(),
      program ? admin.listReviews(program.id) : Promise.resolve([]),
    ]);
    const mine = program ? tests.filter((t) => t.programSlug === program.slug) : [];
    res.render("admin/program-detail", {
      title: program ? program.title : "Tambah Program",
      nav: "program-training",
      program,
      readiness: program ? evaluateProgramReadiness(program.meetings) : null,
      tests: mine,
      questions: questions.filter((q) => mine.some((t) => t.id === q.testId)),
      reviews,
      saved: o.saved ?? false,
      notice: o.notice ?? "",
    });
  };

  const back = (res: Response, id: number, hash = "") => res.redirect(303, `/admin/program/${id}?ok=1${hash}`);

  // ---------- Informasi Program ----------

  router.get("/admin/program/baru", async (_req, res) => {
    await render(res, null);
  });

  router.post("/admin/program", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const form = readProgramForm(req);
    const input = toInput(form, null);
    if (await store().findProgramBySlug(input.slug)) throw new AppError(409, "ALREADY_EXISTS", "Program dengan slug ini sudah ada");
    const created = await store().createProgram(input); // selalu Draft: belum ada konten
    if (form.status === "ARCHIVED") await store().setProgramStatus(created.id, "ARCHIVED");
    const note = form.status === "PUBLISHED" ? "&info=draft" : "";
    res.redirect(303, `/admin/program/${created.id}?ok=1${note}`);
  });

  router.get("/admin/program/:id", async (req, res) => {
    const program = await loadProgram(req);
    const notice = req.query["info"] === "draft" ? "Program disimpan sebagai Draft. Tambahkan materi yang tampil, lalu ubah status menjadi Terbit." : "";
    await render(res, program, { saved: req.query["ok"] === "1", notice });
  });

  router.post("/admin/program/:id", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const form = readProgramForm(req);
    const input = toInput(form, program);
    if (await store().findProgramBySlug(input.slug, program.id)) throw new AppError(409, "ALREADY_EXISTS", "Program dengan slug ini sudah ada");
    if (form.status === "PUBLISHED") {
      const ready = evaluateProgramReadiness(program.meetings);
      if (!ready.ready) throw new AppError(422, "PROGRAM_NOT_READY", `Program belum bisa diterbitkan: ${ready.reasons.join("; ")}.`);
    }
    await store().updateProgram(program.id, input);
    await store().setProgramStatus(program.id, form.status);
    back(res, program.id);
  });

  router.post("/admin/program/:id/hapus", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    await store().deleteProgram(program.id); // menolak bila masih ada pertemuan
    res.redirect(303, "/admin/program-training?ok=1");
  });

  // ---------- Pertemuan & Materi ----------

  router.post("/admin/program/:id/pertemuan/:meetingId/publikasi", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const found = await store().setMeetingPublished(program.id, intParam(req.params["meetingId"]), trimmed(req, "value") === "1");
    if (!found) throw new AppError(404, "NOT_FOUND", "Pertemuan tidak ditemukan");
    back(res, program.id, "#materi");
  });

  router.post("/admin/program/:id/konten", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const sort = intField(req, "sortOrder");
    const data = parseInput(resourceSchema, {
      meeting: trimmed(req, "meeting") || "new",
      type: trimmed(req, "type"),
      title: trimmed(req, "title"),
      url: trimmed(req, "url"),
      sortOrder: Number.isNaN(sort) ? 0 : sort,
    });
    let meetingId: number;
    if (data.meeting === "new") {
      const next = program.meetings.reduce((n, m) => Math.max(n, m.number), 0) + 1;
      const meeting = await store().createMeeting(program.id, { number: next, title: `Pertemuan ${next}`, sortOrder: next });
      if (!meeting) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
      await store().setMeetingPublished(program.id, meeting.id, true);
      meetingId = meeting.id;
    } else {
      meetingId = Number(data.meeting);
    }
    const created = await store().createResource(program.id, meetingId, {
      type: data.type, title: data.title, url: data.url, sortOrder: data.sortOrder, isPublished: true,
    });
    if (!created) throw new AppError(404, "NOT_FOUND", "Pertemuan tidak ditemukan");
    back(res, program.id, "#materi");
  });

  router.post("/admin/program/:id/konten/:meetingId/:resourceId/publikasi", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const found = await store().setResourcePublished(
      program.id, intParam(req.params["meetingId"]), intParam(req.params["resourceId"]), trimmed(req, "value") === "1",
    );
    if (!found) throw new AppError(404, "NOT_FOUND", "Konten tidak ditemukan");
    back(res, program.id, "#materi");
  });

  router.post("/admin/program/:id/konten/:meetingId/:resourceId/hapus", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const found = await store().deleteResource(program.id, intParam(req.params["meetingId"]), intParam(req.params["resourceId"]));
    if (!found) throw new AppError(404, "NOT_FOUND", "Konten tidak ditemukan");
    back(res, program.id, "#materi");
  });

  // ---------- Pre-test / Post-test ----------

  const testType = (req: Request): "PRE" | "POST" => {
    const t = req.params["type"];
    if (t === "pre") return "PRE";
    if (t === "post") return "POST";
    throw new AppError(404, "NOT_FOUND", "Jenis evaluasi tidak dikenal");
  };

  router.post("/admin/program/:id/tes/:type", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const type = testType(req);
    const data = parseInput(testSchema, {
      meetingNo: intField(req, "meetingNo"),
      title: trimmed(req, "title"),
      instructions: trimmed(req, "instructions"),
      isActive: trimmed(req, "isActive") === "1",
      shuffleQuestions: trimmed(req, "shuffle") === "1",
    });
    await store().saveTrainingTest({ programSlug: program.slug, type, ...data, instructions: data.instructions || null });
    back(res, program.id, `#${type === "PRE" ? "pre" : "post"}-test`);
  });

  router.post("/admin/program/:id/tes/:type/impor", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const type = testType(req);
    const meetingNo = intField(req, "meetingNo");
    if (!Number.isInteger(meetingNo) || meetingNo < 1 || meetingNo > 50) throw new AppError(422, "VALIDATION_ERROR", "Pilih pertemuan evaluasi");
    const parsed = parseQuestionLines(trimmed(req, "content"));
    const admin = store();
    const find = async () =>
      (await admin.listTrainingTests()).find((t) => t.programSlug === program.slug && t.meetingNo === meetingNo && t.type === type);
    let test = await find();
    if (!test) {
      const label = type === "PRE" ? "Pre-test" : "Post-test";
      await admin.saveTrainingTest({ programSlug: program.slug, meetingNo, type, title: `${label} ${program.title} Pertemuan ${meetingNo}`, isActive: false });
      test = await find();
    }
    if (!test) throw new AppError(500, "TEST_NOT_CREATED", "Evaluasi gagal dibuat");
    if (trimmed(req, "replace") === "1") {
      // Soal lama dinonaktifkan, bukan dihapus, agar riwayat jawaban peserta tetap utuh.
      const old = (await admin.listTrainingQuestions()).filter((q) => q.testId === test.id && q.isActive);
      for (const q of old) await admin.setTrainingQuestionActive(q.id, false);
    }
    for (const q of parsed) await admin.addTrainingQuestion(test.id, q);
    back(res, program.id, `#${type === "PRE" ? "pre" : "post"}-test`);
  });

  // ---------- Rating & Ulasan ----------

  router.post("/admin/program/:id/ulasan/:reviewId/tampil", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    const program = await loadProgram(req);
    const reviewId = intParam(req.params["reviewId"]);
    const mine = (await store().listReviews(program.id)).some((r) => r.id === reviewId);
    if (!mine || !(await store().setReviewVisible(reviewId, trimmed(req, "value") === "1"))) {
      throw new AppError(404, "NOT_FOUND", "Ulasan tidak ditemukan");
    }
    back(res, program.id, "#ulasan");
  });

  // ---------- Unggah berkas (sampul & materi) lewat fetch(); token CSRF di header X-CSRF-Token ----------

  const requireCsrfHeader: RequestHandler = (req, res, next) => {
    const binding = res.locals["csrfBinding"] as string | undefined;
    if (!binding || !deps.sec.isValidCsrf(binding, req.get("x-csrf-token"))) {
      res.status(403).json({ error: "Sesi formulir kedaluwarsa. Muat ulang halaman lalu coba lagi." });
      return;
    }
    next();
  };

  router.post(
    "/admin/berkas",
    deps.sec.checkOrigin,
    requireCsrfHeader,
    rawUpload,
    jsonUpload(async (req, res) => {
      const purpose = req.get("x-purpose") === "COVER" ? "COVER" : "MATERIAL";
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const meta = validateUpload(purpose, headerFileName(req), body);
      const saved = await store().saveFile({ purpose, fileName: meta.fileName, contentType: meta.contentType, data: body });
      res.status(201).json({ url: fileUrl(saved.id, meta.fileName), name: meta.fileName });
    }),
  );
}

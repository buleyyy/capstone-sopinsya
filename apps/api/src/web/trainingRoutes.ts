import { Router, type Request } from "express";
import type { TestKind } from "../domain/training.js";
import {
  addQuestion,
  createMeeting,
  createProgram,
  createResource,
  deleteMeeting,
  deleteProgram,
  deleteQuestion,
  deleteResource,
  loadMeetingContext,
  openTest,
  setQuestionActive,
  updateMeeting,
  updateProgram,
  updateQuestion,
  updateResource,
  updateTest,
} from "../services/trainingAdminService.js";
import { AppError } from "../utils/errors.js";
import { requireTrainingStore, type WebDeps } from "./deps.js";
import { field, intParam, trimmed } from "./helpers.js";

const ok = "?ok=1";

/** Angka dari formulir; kosong = nilai bawaan; tidak valid = NaN (ditolak validasi service). */
function num(req: Request, key: string, fallback: number): number {
  const v = trimmed(req, key);
  if (v === "") return fallback;
  return /^\d{1,9}$/.test(v) ? Number(v) : Number.NaN;
}

const flag = (req: Request, key: string): boolean => trimmed(req, key) === "1";

function id(value: string | string[] | undefined, what: string): number {
  const n = intParam(value);
  if (Number.isNaN(n) || n < 1) throw new AppError(404, "NOT_FOUND", `${what} tidak ditemukan`);
  return n;
}

function kindOf(value: string | string[] | undefined): TestKind {
  if (value === "pre") return "PRE";
  if (value === "post") return "POST";
  throw new AppError(404, "NOT_FOUND", "Tes tidak ditemukan");
}

const programBody = (req: Request) => ({
  code: trimmed(req, "code"),
  title: trimmed(req, "title"),
  fullTitle: trimmed(req, "fullTitle"),
  subtitle: trimmed(req, "subtitle"),
  summary: trimmed(req, "summary"),
  description: trimmed(req, "description"),
  duration: trimmed(req, "duration"),
  mode: trimmed(req, "mode"),
  trainer: trimmed(req, "trainer"),
  category: trimmed(req, "category"),
  tone: trimmed(req, "tone"),
  sortOrder: num(req, "sortOrder", 0),
  isPublished: flag(req, "isPublished"),
});

const meetingBody = (req: Request) => ({
  title: trimmed(req, "title"),
  sortOrder: num(req, "sortOrder", 0),
  isPublished: flag(req, "isPublished"),
});

const resourceBody = (req: Request) => ({
  type: trimmed(req, "type"),
  title: trimmed(req, "title"),
  url: trimmed(req, "url"),
  sortOrder: num(req, "sortOrder", 0),
  isPublished: flag(req, "isPublished"),
});

const questionBody = (req: Request) => ({
  orderNo: num(req, "orderNo", 0),
  text: trimmed(req, "text"),
  options: (["A", "B", "C", "D"] as const).map((label) => ({ label, text: trimmed(req, `option${label}`) })),
  correctLabel: trimmed(req, "correctLabel"),
});

/**
 * Admin: program ISO, pertemuan, sumber belajar (materi/PDF, silabus, SOP, studi kasus, Blooket, video),
 * serta soal pre/post-test per pertemuan. Terpisah dari /admin/program-training (13 kamar BNSP).
 * Semua rute di bawah /admin sudah dilindungi sec.requireAdmin; diulang di sini sebagai pertahanan berlapis.
 */
export function createTrainingRouter(deps: WebDeps): Router {
  const router = Router();
  const { sec } = deps;
  router.use("/admin/program", sec.requireAdmin);
  const post = [sec.checkOrigin, sec.requireCsrf] as const;

  // ---------- Program ----------

  router.get("/admin/program", async (req, res) => {
    const programs = await requireTrainingStore(deps).listPrograms();
    res.render("admin/program-list", { title: "Program Pelatihan ISO", nav: "program-iso", programs, saved: req.query["ok"] === "1" });
  });

  router.post("/admin/program", ...post, async (req, res) => {
    const created = await createProgram(requireTrainingStore(deps), { slug: trimmed(req, "slug"), ...programBody(req) });
    res.redirect(303, `/admin/program/${created.id}${ok}`);
  });

  router.get("/admin/program/:id", async (req, res) => {
    const program = await requireTrainingStore(deps).getProgramTree(id(req.params["id"], "Program"));
    if (!program) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
    res.render("admin/program-detail", { title: program.fullTitle, nav: "program-iso", program, saved: req.query["ok"] === "1" });
  });

  router.post("/admin/program/:id", ...post, async (req, res) => {
    const programId = id(req.params["id"], "Program");
    await updateProgram(requireTrainingStore(deps), programId, programBody(req));
    res.redirect(303, `/admin/program/${programId}${ok}`);
  });

  router.post("/admin/program/:id/hapus", ...post, async (req, res) => {
    await deleteProgram(requireTrainingStore(deps), id(req.params["id"], "Program"));
    res.redirect(303, `/admin/program${ok}`);
  });

  // ---------- Pertemuan ----------

  router.post("/admin/program/:id/pertemuan", ...post, async (req, res) => {
    const programId = id(req.params["id"], "Program");
    const created = await createMeeting(requireTrainingStore(deps), programId, { number: num(req, "number", Number.NaN), ...meetingBody(req) });
    res.redirect(303, `/admin/program/${programId}/pertemuan/${created.id}${ok}`);
  });

  router.get("/admin/program/:id/pertemuan/:mid", async (req, res) => {
    const store = requireTrainingStore(deps);
    const { program, meeting } = await loadMeetingContext(store, id(req.params["id"], "Program"), id(req.params["mid"], "Pertemuan"));
    const [pre, post_] = await Promise.all([store.findTest(program.slug, meeting.number, "PRE"), store.findTest(program.slug, meeting.number, "POST")]);
    res.render("admin/pertemuan", {
      title: `${meeting.title} - ${program.fullTitle}`,
      nav: "program-iso",
      program,
      meeting,
      tests: { pre, post: post_ },
      saved: req.query["ok"] === "1",
    });
  });

  router.post("/admin/program/:id/pertemuan/:mid", ...post, async (req, res) => {
    const programId = id(req.params["id"], "Program");
    const meetingId = id(req.params["mid"], "Pertemuan");
    await updateMeeting(requireTrainingStore(deps), programId, meetingId, meetingBody(req));
    res.redirect(303, `/admin/program/${programId}/pertemuan/${meetingId}${ok}`);
  });

  router.post("/admin/program/:id/pertemuan/:mid/hapus", ...post, async (req, res) => {
    const programId = id(req.params["id"], "Program");
    await deleteMeeting(requireTrainingStore(deps), programId, id(req.params["mid"], "Pertemuan"));
    res.redirect(303, `/admin/program/${programId}${ok}`);
  });

  // ---------- Sumber belajar ----------

  router.post("/admin/program/:id/pertemuan/:mid/sumber", ...post, async (req, res) => {
    const programId = id(req.params["id"], "Program");
    const meetingId = id(req.params["mid"], "Pertemuan");
    await createResource(requireTrainingStore(deps), programId, meetingId, resourceBody(req));
    res.redirect(303, `/admin/program/${programId}/pertemuan/${meetingId}${ok}`);
  });

  router.post("/admin/program/:id/pertemuan/:mid/sumber/:rid", ...post, async (req, res) => {
    const programId = id(req.params["id"], "Program");
    const meetingId = id(req.params["mid"], "Pertemuan");
    await updateResource(requireTrainingStore(deps), programId, meetingId, id(req.params["rid"], "Sumber belajar"), resourceBody(req));
    res.redirect(303, `/admin/program/${programId}/pertemuan/${meetingId}${ok}`);
  });

  router.post("/admin/program/:id/pertemuan/:mid/sumber/:rid/hapus", ...post, async (req, res) => {
    const programId = id(req.params["id"], "Program");
    const meetingId = id(req.params["mid"], "Pertemuan");
    await deleteResource(requireTrainingStore(deps), programId, meetingId, id(req.params["rid"], "Sumber belajar"));
    res.redirect(303, `/admin/program/${programId}/pertemuan/${meetingId}${ok}`);
  });

  // ---------- Pre-test / Post-test ----------

  router.get("/admin/program/:id/pertemuan/:mid/tes/:type", async (req, res) => {
    const store = requireTrainingStore(deps);
    const programId = id(req.params["id"], "Program");
    const meetingId = id(req.params["mid"], "Pertemuan");
    const kind = kindOf(req.params["type"]);
    const { program, meeting } = await loadMeetingContext(store, programId, meetingId);
    const test = await openTest(store, programId, meetingId, kind);
    res.render("admin/tes", {
      title: `${kind === "PRE" ? "Pre-test" : "Post-test"} - ${meeting.title}`,
      nav: "program-iso",
      program,
      meeting,
      test,
      kind,
      kindSlug: kind === "PRE" ? "pre" : "post",
      saved: req.query["ok"] === "1",
    });
  });

  const testBase = (req: Request) =>
    `/admin/program/${id(req.params["id"], "Program")}/pertemuan/${id(req.params["mid"], "Pertemuan")}/tes/${req.params["type"] === "pre" ? "pre" : "post"}`;

  // Tes selalu dimuat dari jalur URL (slug + nomor + jenis), sehingga soal milik tes lain ditolak oleh service.
  const loadTest = async (req: Request) =>
    openTest(requireTrainingStore(deps), id(req.params["id"], "Program"), id(req.params["mid"], "Pertemuan"), kindOf(req.params["type"]));

  router.post("/admin/program/:id/pertemuan/:mid/tes/:type", ...post, async (req, res) => {
    const test = await loadTest(req);
    await updateTest(requireTrainingStore(deps), test, { title: trimmed(req, "title"), isActive: flag(req, "isActive") });
    res.redirect(303, `${testBase(req)}${ok}`);
  });

  router.post("/admin/program/:id/pertemuan/:mid/tes/:type/soal", ...post, async (req, res) => {
    await addQuestion(requireTrainingStore(deps), await loadTest(req), questionBody(req));
    res.redirect(303, `${testBase(req)}${ok}`);
  });

  router.post("/admin/program/:id/pertemuan/:mid/tes/:type/soal/:qid", ...post, async (req, res) => {
    await updateQuestion(requireTrainingStore(deps), await loadTest(req), id(req.params["qid"], "Soal"), questionBody(req));
    res.redirect(303, `${testBase(req)}${ok}`);
  });

  router.post("/admin/program/:id/pertemuan/:mid/tes/:type/soal/:qid/status", ...post, async (req, res) => {
    await setQuestionActive(requireTrainingStore(deps), await loadTest(req), id(req.params["qid"], "Soal"), field(req, "value") === "1");
    res.redirect(303, `${testBase(req)}${ok}`);
  });

  router.post("/admin/program/:id/pertemuan/:mid/tes/:type/soal/:qid/hapus", ...post, async (req, res) => {
    await deleteQuestion(requireTrainingStore(deps), await loadTest(req), id(req.params["qid"], "Soal"));
    res.redirect(303, `${testBase(req)}${ok}`);
  });

  return router;
}

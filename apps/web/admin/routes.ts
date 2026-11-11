import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { parseInput } from "../../api/src/domain/auditSchemas.js";
import {
  activateSession,
  addChecklistItem,
  assignAuditorAccount,
  closeSession,
  createAssignment,
  createChecklistVersion,
  createDepartment,
  createSession,
  createStandard,
  extendSession,
  publishChecklistVersion,
  revokeAuditor,
} from "../../api/src/services/adminService.js";
import {
  createAccount,
  resetAccountPassword,
  setAccountActive,
  updateAccount,
} from "../../api/src/services/accountService.js";
import type { AccountRecord } from "../../api/src/domain/accountStore.js";
import { DEFAULT_DOCUMENT_HEADER } from "../../api/src/services/auditService.js";
import { AppError } from "../../api/src/utils/errors.js";
import { registerStats } from "../shared/auditSummary.js";
import { requireAdminStore, requireStore, type WebDeps } from "../shared/deps.js";
import { ABOUT_KEY, aboutSchema, loadAbout, pointsFromText } from "../shared/aboutContent.js";
import { field, intField, intParam, trimmed, wibInput } from "../shared/helpers.js";
import { loadSite, SITE_KEY, siteSchema } from "../shared/siteIdentity.js";
import { registerEvaluationRoutes } from "./evaluationRoutes.js";
import { registerProgramRoutes } from "./programRoutes.js";

function intList(req: Request, key: string): number[] {
  const body = req.body as Record<string, unknown> | undefined;
  const v = body?.[key];
  const arr: unknown[] = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return arr.filter((x): x is string => typeof x === "string" && /^\d{1,9}$/.test(x)).map(Number);
}

const httpsOnly = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
};

const roomSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => (v === "" ? null : v)),
  sortOrder: z.number().int().min(0).max(100000),
  isPublished: z.boolean(),
});

const documentSchema = z.object({
  code: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(255),
  categoryId: z.number().int().positive(),
  departmentId: z.number().int().positive().nullable(),
  pdfUrl: z
    .string()
    .trim()
    .max(1024)
    .refine((v) => v === "" || httpsOnly(v), "Tautan PDF harus berupa URL https:// tanpa kredensial")
    .transform((v) => (v === "" ? null : v)),
  isPublished: z.boolean(),
});

const trainingResourceSchema = z.object({
  programSlug: z.enum(["iso-9001", "iso-14001", "iso-45001", "iso-37001"]),
  meetingNo: z.number().int().min(1).max(2),
  type: z.enum(["SILABUS", "MATERI", "STUDI_KASUS", "VIDEO", "BLOOKET", "LINK_LAIN"]),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).transform((v) => v === "" ? null : v),
  url: z.string().trim().min(1).max(1024).refine(httpsOnly, "URL harus https:// tanpa kredensial"),
  sortOrder: z.number().int().min(0).max(100000),
  isPublished: z.boolean(),
});
const trainingTestSchema = z.object({
  programSlug: z.enum(["iso-9001", "iso-14001", "iso-45001", "iso-37001"]),
  meetingNo: z.number().int().min(1).max(2),
  type: z.enum(["PRE", "POST"]),
  title: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
});
const trainingQuestionSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  optionA: z.string().trim().max(500).optional().default(""),
  optionB: z.string().trim().max(500).optional().default(""),
  optionC: z.string().trim().max(500).optional().default(""),
  optionD: z.string().trim().max(500).optional().default(""),
  correctOption: z.enum(["A", "B", "C", "D"]),
});

const trainingPrograms = [
  { slug: "iso-9001", label: "ISO 9001: 2015" },
  { slug: "iso-14001", label: "ISO 14001: 2015" },
  { slug: "iso-45001", label: "ISO 45001: 2018" },
  { slug: "iso-37001", label: "ISO 37001: 2025" },
];

const ok = "?ok=1";

/** Halaman Admin (akun database ber-role ADMIN). Semua operasi memakai service Admin yang sudah diuji. */
export function createAdminRouter(deps: WebDeps): Router {
  const router = Router();
  const { sec } = deps;

  // Masuk ditangani gerbang bersama (loginRoutes.ts). Semua rute /admin wajib login Admin.
  router.use("/admin", sec.requireAdmin);
  // Akun database: aktif dan ber-role ADMIN diperiksa ulang tiap request (penonaktifan langsung memutus akses).
  router.use("/admin", async (req, res, next) => {
    try {
      const identity = sec.adminIdentity(req);
      if (identity && identity.userId !== null) {
        const account = deps.accounts ? await deps.accounts.findById(identity.userId) : null;
        if (!account || !account.isActive || account.role !== "ADMIN") {
          sec.clearAdminCookie(res);
          res.redirect(303, "/masuk");
          return;
        }
        res.locals["adminName"] = account.name; // nama di navbar atas
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/keluar", sec.checkOrigin, sec.requireCsrf, (_req, res) => {
    sec.clearAdminCookie(res);
    res.redirect(303, "/masuk");
  });

  // ---------- Beranda ----------

  // Dashboard Admin (desain Figma "Dashboard Admin"): ringkasan program, peserta, bank soal, dan konten yang
  // dikelola beserta halaman peserta yang dipengaruhinya. Semua angka dibaca dari store; tanpa data contoh.
  router.get("/admin", async (_req, res) => {
    const admin = requireAdminStore(deps);
    const [programs, details, tests, attempts, documents, sessions, reviews] = await Promise.all([
      admin.listPrograms().catch(() => null), // tabel program belum dimigrasi: pakai daftar program bawaan
      admin.listPrograms().then((ps) => Promise.all(ps.map((p) => admin.getProgram(p.id)))).catch(() => []),
      admin.listTrainingTests(),
      admin.listTrainingAttempts(),
      admin.listDocuments(),
      admin.listSessions(),
      admin.listReviews().catch(() => []),
    ]);
    // Konten Course Builder (yang dibaca halaman peserta) per jenis.
    const resources = details.flatMap((d) => (d ? d.meetings.flatMap((m) => m.resources) : []));
    const visible = reviews.filter((r) => r.isVisible);
    const programTotal = programs ? programs.length : trainingPrograms.length;
    const published = programs ? programs.filter((p) => p.status === "PUBLISHED").length : trainingPrograms.length;
    const participants = new Set(attempts.map((a) => `${a.participantName.trim().toLowerCase()}|${a.participantInstitution.trim().toLowerCase()}`)).size;
    const kind = (k: string) => resources.filter((r) => r.type === k).length;
    const avg = visible.length ? Math.round((visible.reduce((n, r) => n + r.rating, 0) / visible.length) * 10) / 10 : 0;
    const pre = tests.filter((t) => t.type === "PRE").length;
    const post = tests.filter((t) => t.type === "POST").length;
    res.render("admin/dashboard", {
      title: "Dashboard Admin",
      nav: "dashboard",
      cards: {
        programTotal,
        published,
        inactive: Math.max(0, programTotal - published),
        participants,
        tests: pre + post,
        pre,
        post,
      },
      content: [
        { label: "Program Pelatihan", count: programTotal, page: "Halaman Program › Daftar Program", href: "/admin/program-training" },
        { label: "Silabus", count: kind("SYLLABUS"), page: "Halaman Detail Program › Silabus", href: "/admin/program-training" },
        { label: "Materi Pelatihan", count: kind("MATERIAL"), page: "Halaman Detail Program › Materi", href: "/admin/program-training" },
        { label: "Studi Kasus", count: kind("CASE_STUDY"), page: "Halaman Studi Kasus 1–4", href: "/admin/program-training" },
        { label: "Quiz Game", count: kind("BLOOKET"), page: "Halaman Detail Program › Quiz Game", href: "/admin/program-training" },
        { label: "Video Referensi", count: kind("VIDEO"), page: "Halaman Video Referensi", href: "/admin/program-training" },
        { label: "Pustaka SOP", count: kind("SOP") + documents.length, page: "Halaman Detail Program › Pustaka SOP", href: "/admin/sop" },
        { label: "Kelola Soal", count: tests.reduce((n, t) => n + t.questionCount, 0), page: "Halaman Detail Program › Pre-test · Post-test", href: "/admin/program-training?tab=tes" },
        { label: "Ulasan Peserta", count: reviews.length, page: "Halaman Detail Program › Rating & Ulasan", href: "/admin/program-training" },
        { label: "Visi & Misi", count: null, page: "Halaman Visi & Misi", href: "/admin/pengaturan" },
      ],
      sessions: sessions.map((x) => ({ id: x.id, title: x.title, status: x.status })),
      rating: {
        average: avg,
        count: visible.length,
        buckets: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: visible.filter((r) => r.rating === stars).length })),
      },
    });
  });

  // Dashboard Audit (hanya baca): Admin memilih sesi audit lewat ?sesi=<id>. Bawaan: sesi ACTIVE terbaru,
  // bila tidak ada, sesi terbaru. Angka dihitung dari register temuan seluruh auditor pada sesi itu.
  router.get("/admin/audit", async (req, res) => {
    const admin = requireAdminStore(deps);
    const sessions = await admin.listSessions(); // urut id menurun: yang pertama = terbaru
    const asked = intParam(typeof req.query["sesi"] === "string" ? req.query["sesi"] : undefined);
    const selected = sessions.find((s) => s.id === asked) ?? sessions.find((s) => s.status === "ACTIVE") ?? sessions[0] ?? null;
    const data = selected ? await admin.getSessionAuditRegister(selected.id) : null;
    const rows = data?.rows ?? [];
    res.render("admin/beranda", {
      title: "Dashboard Audit",
      nav: "dashboard",
      sessions,
      selected,
      header: data?.header ?? DEFAULT_DOCUMENT_HEADER,
      auditors: data?.auditors ?? [],
      register: rows,
      stats: registerStats(rows),
    });
  });

  // ---------- Departemen ----------

  router.get("/admin/departemen", async (req, res) => {
    const departments = await requireAdminStore(deps).listDepartments();
    res.render("admin/departemen", { title: "Departemen", departments, saved: req.query["ok"] === "1" });
  });

  router.post("/admin/departemen", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    await createDepartment(requireStore(deps), { name: trimmed(req, "name") });
    res.redirect(303, `/admin/departemen${ok}`);
  });

  // ---------- Checklist ----------

  router.get("/admin/checklist", async (req, res) => {
    const admin = requireAdminStore(deps);
    const [standards, versions] = await Promise.all([admin.listStandards(), admin.listVersions()]);
    res.render("admin/checklist", { title: "Master Checklist Audit", standards, versions, saved: req.query["ok"] === "1" });
  });

  router.post("/admin/checklist/standar", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    await createStandard(requireStore(deps), { code: trimmed(req, "code"), name: trimmed(req, "name") });
    res.redirect(303, `/admin/checklist${ok}`);
  });

  router.post("/admin/checklist/versi", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const version = await createChecklistVersion(requireStore(deps), {
      standardId: intField(req, "standardId"),
      versionLabel: trimmed(req, "versionLabel"),
    });
    res.redirect(303, `/admin/checklist/${version.id}${ok}`);
  });

  router.get("/admin/checklist/:id", async (req, res) => {
    const admin = requireAdminStore(deps);
    const id = intParam(req.params["id"]);
    const detail = Number.isNaN(id) ? null : await admin.getVersion(id);
    if (!detail) throw new AppError(404, "NOT_FOUND", "Versi checklist tidak ditemukan");
    const [departments, documents] = await Promise.all([admin.listDepartments(), admin.listDocuments()]);
    res.render("admin/versi", { title: `Checklist ${detail.version.standardCode} ${detail.version.versionLabel}`, ...detail, departments, documents, saved: req.query["ok"] === "1" });
  });

  router.post("/admin/checklist/:id/item", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const versionId = intParam(req.params["id"]);
    const departmentId = intField(req, "departmentId");
    const sopRaw = trimmed(req, "sopId");
    const sopId = sopRaw === "" ? null : Number(sopRaw);
    const baseOrder = Number.isNaN(intField(req, "sortOrder")) ? 0 : intField(req, "sortOrder");

    // Satu baris = satu poin. Format "Rujukan | Kriteria" (rujukan opsional, mis. "Klausul 4.1 | Apakah ...?").
    const lines = field(req, "criteria")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
    if (lines.length === 0) throw new AppError(422, "VALIDATION_ERROR", "Isi minimal satu poin checklist");
    if (lines.length > 200) throw new AppError(422, "VALIDATION_ERROR", "Maksimal 200 poin per kiriman");

    let index = 0;
    for (const line of lines) {
      const bar = line.indexOf("|");
      const reference = bar > 0 ? line.slice(0, bar).trim() : null;
      const criteria = bar > 0 ? line.slice(bar + 1).trim() : line;
      await addChecklistItem(store, {
        versionId,
        departmentId,
        sopId,
        criteria,
        reference: reference === "" ? null : reference,
        sortOrder: baseOrder + index * 10,
      });
      index += 1;
    }
    res.redirect(303, `/admin/checklist/${versionId}${ok}`);
  });

  router.post("/admin/checklist/:id/terbit", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const versionId = intParam(req.params["id"]);
    await publishChecklistVersion(requireStore(deps), { versionId });
    res.redirect(303, `/admin/checklist/${versionId}${ok}`);
  });

  // ---------- Sesi audit ----------

  router.get("/admin/sesi", async (req, res) => {
    const admin = requireAdminStore(deps);
    const [sessions, versions] = await Promise.all([admin.listSessions(), admin.listVersions()]);
    res.render("admin/sesi", {
      title: "Sesi Audit",
      sessions,
      versions: versions.filter((v) => v.status === "PUBLISHED"),
      saved: req.query["ok"] === "1",
    });
  });

  router.post("/admin/sesi", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    // Master Checklist opsional: kosong = sesi tanpa checklist.
    const versionId = intField(req, "checklistVersionId");
    const session = await createSession(requireStore(deps), {
      title: trimmed(req, "title"),
      checklistVersionId: Number.isNaN(versionId) ? null : versionId,
      expiresAt: wibInput(field(req, "expiresAt")),
    });
    res.redirect(303, `/admin/sesi/${session.id}${ok}`);
  });

  const renderSession = async (req: Request, res: Response, id: number) => {
    const admin = requireAdminStore(deps);
    const detail = Number.isNaN(id) ? null : await admin.getSession(id);
    if (!detail) throw new AppError(404, "NOT_FOUND", "Sesi tidak ditemukan");
    const departments = await admin.listDepartments();
    // Akun Auditor aktif yang belum memiliki penugasan aktif pada sesi ini.
    const assigned = new Set(detail.auditors.filter((a) => a.state !== "DICABUT" && a.userId !== null).map((a) => a.userId));
    const accounts: AccountRecord[] = deps.accounts
      ? (await deps.accounts.list("AUDITOR")).filter((a) => a.isActive && !assigned.has(a.id))
      : [];
    res.render("admin/sesi-detail", {
      title: detail.session.title,
      ...detail,
      departments,
      accounts,
      saved: req.query["ok"] === "1",
    });
  };

  router.get("/admin/sesi/:id", async (req, res) => {
    await renderSession(req, res, intParam(req.params["id"]));
  });

  router.post("/admin/sesi/:id/aktifkan", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    await activateSession(requireStore(deps), { sessionId: id });
    res.redirect(303, `/admin/sesi/${id}${ok}`);
  });

  router.post("/admin/sesi/:id/perpanjang", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    await extendSession(requireStore(deps), { sessionId: id, to: wibInput(field(req, "to")) });
    res.redirect(303, `/admin/sesi/${id}${ok}`);
  });

  router.post("/admin/sesi/:id/tutup", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    const until = trimmed(req, "mode") === "until";
    await closeSession(requireStore(deps), {
      sessionId: id,
      ...(until ? { accessUntil: wibInput(field(req, "accessUntil")) } : { noAccess: true }),
    });
    res.redirect(303, `/admin/sesi/${id}${ok}`);
  });

  // Penugasan akun Auditor ke sesi (menggantikan undangan/token). Auditor hanya melihat sesi yang ditugaskan kepadanya.
  router.post("/admin/sesi/:id/auditor", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    if (!deps.accounts) throw new AppError(503, "ACCOUNTS_UNAVAILABLE", "Penyimpanan akun belum tersedia");
    await assignAuditorAccount(requireStore(deps), deps.accounts, {
      sessionId: id,
      accountId: intField(req, "accountId"),
      excludeDepartmentIds: intList(req, "exclude"),
      noExclusions: trimmed(req, "noExclusions") === "1",
    });
    res.redirect(303, `/admin/sesi/${id}${ok}`);
  });
  router.post("/admin/sesi/:id/auditor/:auditorId/cabut", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    await revokeAuditor(requireStore(deps), { sessionId: id, auditorId: intParam(req.params["auditorId"]) });
    res.redirect(303, `/admin/sesi/${id}${ok}`);
  });

  router.post("/admin/sesi/:id/penugasan", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    await createAssignment(requireStore(deps), {
      sessionId: id,
      auditorId: intField(req, "auditorId"),
      departmentId: intField(req, "departmentId"),
    });
    res.redirect(303, `/admin/sesi/${id}${ok}`);
  });

  // ---------- Kelola Akun (hanya akun Auditor; Admin pertama dibuat lewat bootstrap) ----------
  // Kata sandi sementara hanya ditampilkan SEKALI pada respons pembuatan/reset (Cache-Control: no-store).
  // Halaman ini juga memuat Pengaturan Situs > Identitas & Kontak (mockup "Kelola Hak Akses & Akun").

  const renderAccounts = async (
    req: Request,
    res: Response,
    o: { saved?: boolean; generated?: { name: string; email: string; password: string } | undefined; status?: number; editId?: number | null } = {},
  ) => {
    if (!deps.accounts) throw new AppError(503, "ACCOUNTS_UNAVAILABLE", "Penyimpanan akun belum tersedia");
    const accounts = await deps.accounts.list(); // Admin & Auditor
    accounts.sort((a, b) => (a.role === b.role ? a.id - b.id : a.role === "ADMIN" ? -1 : 1));
    const site = await loadSite(deps.admin);
    const all = req.query["semua"] === "1";
    res.set("Cache-Control", "no-store");
    res.status(o.status ?? 200).render("admin/akun", {
      title: "Kelola Akun",
      nav: "akun",
      accounts: all ? accounts : accounts.slice(0, 5),
      accountTotal: accounts.length,
      showAll: all,
      selfId: sec.adminIdentity(req)?.userId ?? null,
      editing: accounts.find((a) => a.id === o.editId) ?? null, // panel kanan "Ubah Akun" (?ubah=<id>)
      saved: o.saved ?? false,
      siteSaved: req.query["situs"] === "1",
      generated: o.generated,
      site,
    });
  };

  const requireAccounts = () => {
    if (!deps.accounts) throw new AppError(503, "ACCOUNTS_UNAVAILABLE", "Penyimpanan akun belum tersedia");
    return deps.accounts;
  };

  router.get("/admin/akun", async (req, res) => {
    const editRaw = typeof req.query["ubah"] === "string" ? req.query["ubah"] : "";
    const editId = /^\d{1,9}$/.test(editRaw) ? Number(editRaw) : null;
    await renderAccounts(req, res, { saved: req.query["ok"] === "1", editId });
  });

  router.post("/admin/akun", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const role = trimmed(req, "role") === "ADMIN" ? "ADMIN" : "AUDITOR";
    if (field(req, "password") === "") throw new AppError(422, "VALIDATION_ERROR", "Kata sandi awal wajib diisi");
    await createAccount(requireAccounts(), { email: trimmed(req, "email"), name: trimmed(req, "name"), password: field(req, "password") }, role);
    res.redirect(303, `/admin/akun${ok}`);
  });

  router.post("/admin/akun/:id", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    await updateAccount(requireAccounts(), {
      accountId: intParam(req.params["id"]),
      email: trimmed(req, "email"),
      name: trimmed(req, "name"),
    });
    res.redirect(303, `/admin/akun${ok}`);
  });

  router.post("/admin/akun/:id/status", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    await setAccountActive(
      requireAccounts(),
      { accountId: intParam(req.params["id"]), isActive: trimmed(req, "value") === "1" },
      sec.adminIdentity(req)?.userId ?? null,
    );
    res.redirect(303, `/admin/akun${ok}`);
  });

  router.post("/admin/akun/:id/reset-password", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const result = await resetAccountPassword(requireAccounts(), {
      accountId: intParam(req.params["id"]),
      password: field(req, "password"),
    });
    await renderAccounts(req, res, {
      generated: result.temporaryPassword
        ? { name: result.account.name, email: result.account.email, password: result.temporaryPassword }
        : undefined,
      saved: result.temporaryPassword === null,
    });
  });

  router.post("/admin/pengaturan/situs", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const keys = ["siteName", "tagline", "whatsapp", "email", "hours", "address", "instagram", "linkedin", "youtube", "facebook"] as const;
    const data = parseInput(siteSchema, Object.fromEntries(keys.map((k) => [k, trimmed(req, k)])));
    await requireAdminStore(deps).saveSiteContent(SITE_KEY, data);
    res.redirect(303, "/admin/akun?situs=1#pengaturan-situs");
  });

  // ---------- Manajemen Program Training ----------
  // Program dan pertemuan didefinisikan di apps/web/peserta/programs.ts.
  // Halaman ini mengelola konten pendukung dan tes yang terikat pada slug/pertemuan tersebut.
  router.get("/admin/program-training", async (req, res) => {
    const admin = requireAdminStore(deps);
    const [resources, tests, questions, catalog] = await Promise.all([
      admin.listTrainingResources(),
      admin.listTrainingTests(),
      admin.listTrainingQuestions(),
      admin.listPrograms().catch(() => null), // Course Builder (katalog peserta); null bila tabel belum dimigrasi
    ]);
    const reviews = (await admin.listReviews().catch(() => [])).filter((r) => r.isVisible);
    const ratingOf = (programId: number) => {
      const mine = reviews.filter((r) => r.programId === programId);
      return mine.length ? { average: Math.round((mine.reduce((n, r) => n + r.rating, 0) / mine.length) * 10) / 10, count: mine.length } : null;
    };
    const tab = ["program", "materi", "tes"].includes(String(req.query["tab"])) ? String(req.query["tab"]) : "program";
    res.render("admin/program-training", {
      title: "Manajemen Program Training",
      nav: "program-training",
      tab,
      selectedTestId: Number(req.query["testId"]) || null,
      programs: trainingPrograms,
      catalog,
      ratingOf,
      resources,
      tests,
      questions,
      saved: req.query["ok"] === "1",
    });
  });

  router.post("/admin/program-training/resource", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const sort = intField(req, "sortOrder");
    const data = parseInput(trainingResourceSchema, {
      programSlug: trimmed(req, "programSlug"),
      meetingNo: intField(req, "meetingNo"),
      type: trimmed(req, "type"),
      title: trimmed(req, "title"),
      description: trimmed(req, "description"),
      url: trimmed(req, "url"),
      sortOrder: Number.isNaN(sort) ? 0 : sort,
      isPublished: trimmed(req, "isPublished") === "1",
    });
    await requireAdminStore(deps).createTrainingResource(data);
    res.redirect(303, `/admin/program-training?tab=materi${ok}`);
  });

  router.post("/admin/program-training/resource/:id", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const sort = intField(req, "sortOrder");
    const data = parseInput(trainingResourceSchema, {
      programSlug: trimmed(req, "programSlug"),
      meetingNo: intField(req, "meetingNo"),
      type: trimmed(req, "type"),
      title: trimmed(req, "title"),
      description: trimmed(req, "description"),
      url: trimmed(req, "url"),
      sortOrder: Number.isNaN(sort) ? 0 : sort,
      isPublished: trimmed(req, "isPublished") === "1",
    });
    const found = await requireAdminStore(deps).updateTrainingResource(intParam(req.params["id"]), data);
    if (!found) throw new AppError(404, "NOT_FOUND", "Konten training tidak ditemukan");
    res.redirect(303, `/admin/program-training?tab=materi${ok}`);
  });

  router.post("/admin/program-training/resource/:id/publikasi", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const found = await requireAdminStore(deps).setTrainingResourcePublished(intParam(req.params["id"]), trimmed(req, "value") === "1");
    if (!found) throw new AppError(404, "NOT_FOUND", "Konten training tidak ditemukan");
    res.redirect(303, `/admin/program-training?tab=materi${ok}`);
  });

  router.post("/admin/program-training/test", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const data = parseInput(trainingTestSchema, {
      programSlug: trimmed(req, "programSlug"),
      meetingNo: intField(req, "meetingNo"),
      type: trimmed(req, "type"),
      title: trimmed(req, "title"),
      isActive: trimmed(req, "isActive") === "1",
    });
    await requireAdminStore(deps).saveTrainingTest(data);
    res.redirect(303, `/admin/program-training?tab=tes${ok}`);
  });

  router.post("/admin/program-training/test/:id/question", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const testId = intParam(req.params["id"]);
    const raw = parseInput(trainingQuestionSchema, {
      text: trimmed(req, "text"),
      optionA: trimmed(req, "optionA"),
      optionB: trimmed(req, "optionB"),
      optionC: trimmed(req, "optionC"),
      optionD: trimmed(req, "optionD"),
      correctOption: trimmed(req, "correctOption"),
    });
    const options = [
      { label: "A", text: raw.optionA },
      { label: "B", text: raw.optionB },
      { label: "C", text: raw.optionC },
      { label: "D", text: raw.optionD },
    ].filter((option) => option.text !== "");
    if (options.length < 2 || !options.some((option) => option.label === raw.correctOption)) {
      throw new AppError(422, "VALIDATION_ERROR", "Isi minimal dua pilihan dan pastikan kunci jawaban termasuk pilihan yang diisi.");
    }
    const admin = requireAdminStore(deps);
    if (!(await admin.listTrainingTests()).some((test) => test.id === testId)) throw new AppError(404, "NOT_FOUND", "Tes tidak ditemukan");
    await admin.addTrainingQuestion(testId, {
      text: raw.text,
      options: options.map((option) => ({ ...option, isCorrect: option.label === raw.correctOption })),
    });
    res.redirect(303, `/admin/program-training?tab=tes&testId=${testId}&ok=1`);
  });

  router.post("/admin/program-training/test/:id/status", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const testId = intParam(req.params["id"]);
    const active = trimmed(req, "value") === "1";
    const found = await requireAdminStore(deps).saveTrainingTestStatus(testId, active);
    if (!found) throw new AppError(404, "NOT_FOUND", "Tes tidak ditemukan");
    res.redirect(303, `/admin/program-training?tab=tes${ok}`);
  });

  router.post("/admin/program-training/question/:id/status", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const found = await requireAdminStore(deps).setTrainingQuestionActive(intParam(req.params["id"]), trimmed(req, "value") === "1");
    if (!found) throw new AppError(404, "NOT_FOUND", "Soal tidak ditemukan");
    res.redirect(303, `/admin/program-training?tab=tes${ok}`);
  });

  // ---------- Peserta & Hasil Evaluasi (hanya Admin): lihat evaluationRoutes.ts ----------
  registerEvaluationRoutes(router, deps, trainingPrograms);

  // ---------- Pengaturan situs peserta (halaman Tentang Kami) ----------

  router.get("/admin/pengaturan", async (req, res) => {
    const about = await loadAbout(requireAdminStore(deps));
    res.render("admin/pengaturan", { title: "Pengaturan", nav: "pengaturan", about, saved: req.query["ok"] === "1" });
  });

  router.post("/admin/pengaturan/tentang-kami", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const data = parseInput(aboutSchema, {
      intro: trimmed(req, "intro"),
      vision: { title: trimmed(req, "visionTitle"), points: pointsFromText(field(req, "visionPoints")) },
      mission: { title: trimmed(req, "missionTitle"), points: pointsFromText(field(req, "missionPoints")) },
    });
    await requireAdminStore(deps).saveSiteContent(ABOUT_KEY, data);
    res.redirect(303, `/admin/pengaturan${ok}`);
  });

  // ---------- Pustaka SOP ----------

  router.get("/admin/sop", async (req, res) => {
    const admin = requireAdminStore(deps);
    const [rooms, documents, departments] = await Promise.all([admin.listRooms(), admin.listDocuments(), admin.listDepartments()]);
    res.render("admin/sop", { title: "Pustaka SOP", rooms, documents, departments, saved: req.query["ok"] === "1" });
  });

  router.post("/admin/sop/Program", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const sort = intField(req, "sortOrder");
    const data = parseInput(roomSchema, {
      name: trimmed(req, "name"),
      description: trimmed(req, "description"),
      sortOrder: Number.isNaN(sort) ? 0 : sort,
      isPublished: trimmed(req, "isPublished") === "1",
    });
    await requireAdminStore(deps).createRoom(data);
    res.redirect(303, `/admin/sop${ok}`);
  });

  router.post("/admin/sop/dokumen", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const dept = intField(req, "departmentId");
    const data = parseInput(documentSchema, {
      code: trimmed(req, "code"),
      title: trimmed(req, "title"),
      categoryId: intField(req, "categoryId"),
      departmentId: Number.isNaN(dept) ? null : dept,
      pdfUrl: trimmed(req, "pdfUrl"),
      isPublished: trimmed(req, "isPublished") === "1",
    });
    await requireAdminStore(deps).createDocument(data);
    res.redirect(303, `/admin/sop${ok}`);
  });

  router.post("/admin/sop/Program/:id/publikasi", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const found = await requireAdminStore(deps).setRoomPublished(intParam(req.params["id"]), trimmed(req, "value") === "1");
    if (!found) throw new AppError(404, "NOT_FOUND", "Programtidak ditemukan");
    res.redirect(303, `/admin/sop${ok}`);
  });

  router.post("/admin/sop/dokumen/:id/publikasi", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const found = await requireAdminStore(deps).setDocumentPublished(intParam(req.params["id"]), trimmed(req, "value") === "1");
    if (!found) throw new AppError(404, "NOT_FOUND", "Dokumen tidak ditemukan");
    res.redirect(303, `/admin/sop${ok}`);
  });

  registerProgramRoutes(router, deps); // Kelola Konten Program (/admin/program/...)

  return router;
}

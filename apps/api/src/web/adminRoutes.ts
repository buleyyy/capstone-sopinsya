import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { parseInput } from "../domain/auditSchemas.js";
import {
  activateSession,
  addChecklistItem,
  closeSession,
  createAssignment,
  createAuditor,
  createChecklistVersion,
  createDepartment,
  createSession,
  createStandard,
  extendSession,
  publishChecklistVersion,
  reissueInvitation,
  revokeAuditor,
} from "../services/adminService.js";
import { AppError } from "../utils/errors.js";
import { requireAdminStore, requireStore, type WebDeps } from "./deps.js";
import { field, intField, intParam, trimmed, wibInput } from "./helpers.js";

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

const ok = "?ok=1";

/** Halaman Admin (satu akun dari ADMIN_PASSWORD untuk UAT). Semua operasi memakai service Admin yang sudah diuji. */
export function createAdminRouter(deps: WebDeps): Router {
  const router = Router();
  const { sec } = deps;

  // Masuk ditangani gerbang bersama (loginRoutes.ts). Semua rute /admin wajib login Admin.
  router.use("/admin", sec.requireAdmin);

  router.post("/admin/keluar", sec.checkOrigin, sec.requireCsrf, (_req, res) => {
    sec.clearAdminCookie(res);
    res.redirect(303, "/masuk");
  });

  // ---------- Beranda ----------

  router.get("/admin", async (_req, res) => {
    const admin = requireAdminStore(deps);
    const [sessions, departments, versions, rooms] = await Promise.all([
      admin.listSessions(),
      admin.listDepartments(),
      admin.listVersions(),
      admin.listRooms(),
    ]);
    res.render("admin/beranda", { title: "Dashboard Admin", sessions, departments, versions, rooms });
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
    const session = await createSession(requireStore(deps), {
      title: trimmed(req, "title"),
      checklistVersionId: intField(req, "checklistVersionId"),
      expiresAt: wibInput(field(req, "expiresAt")),
    });
    res.redirect(303, `/admin/sesi/${session.id}${ok}`);
  });

  const renderSession = async (
    req: Request,
    res: Response,
    id: number,
    extra: { invite?: { name: string; link: string; expires: Date } | undefined } = {},
  ) => {
    const admin = requireAdminStore(deps);
    const detail = Number.isNaN(id) ? null : await admin.getSession(id);
    if (!detail) throw new AppError(404, "NOT_FOUND", "Sesi tidak ditemukan");
    const departments = await admin.listDepartments();
    res.render("admin/sesi-detail", {
      title: detail.session.title,
      ...detail,
      departments,
      invite: extra.invite,
      saved: req.query["ok"] === "1",
    });
  };

  router.get("/admin/sesi/:id", async (req, res) => {
    await renderSession(req, res, intParam(req.params["id"]));
  });

  router.post("/admin/sesi/:id/aktifkan", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    const detail = await requireAdminStore(deps).getSession(id);
    if (!detail) throw new AppError(404, "NOT_FOUND", "Sesi tidak ditemukan");

    const eligibleAuditorIds = new Set(detail.auditors.filter((a) => a.state !== "DICABUT").map((a) => a.id));
    if (eligibleAuditorIds.size === 0) {
      throw new AppError(422, "SESSION_NOT_READY", "Tambahkan minimal satu auditor yang aksesnya belum dicabut sebelum mengaktifkan sesi.");
    }
    const readyAssignments = detail.assignments.filter((a) => eligibleAuditorIds.has(a.auditorId) && a.total > 0);
    if (readyAssignments.length === 0) {
      throw new AppError(422, "SESSION_NOT_READY", "Buat minimal satu penugasan untuk auditor aktif pada unit yang memiliki poin checklist sebelum mengaktifkan sesi.");
    }

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

  const inviteLink = (req: Request, token: string): string => {
    const base = deps.appOrigin ?? `${req.protocol}://${req.get("host") ?? ""}`;
    return `${base}/undangan/${token}`;
  };

  router.post("/admin/sesi/:id/auditor", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    const ttl = intField(req, "inviteTtlHours");
    const result = await createAuditor(requireStore(deps), {
      sessionId: id,
      name: trimmed(req, "name"),
      excludeDepartmentIds: intList(req, "exclude"),
      noExclusions: trimmed(req, "noExclusions") === "1",
      ...(Number.isNaN(ttl) ? {} : { inviteTtlHours: ttl }),
    });
    // Token hanya ada di respons ini; tidak disimpan dan tidak diulang.
    res.set("Cache-Control", "no-store");
    await renderSession(req, res, id, {
      invite: { name: result.auditor.name, link: inviteLink(req, result.inviteToken), expires: result.auditor.inviteExpiresAt },
    });
  });

  router.post("/admin/sesi/:id/auditor/:auditorId/terbit-ulang", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const id = intParam(req.params["id"]);
    const result = await reissueInvitation(requireStore(deps), { sessionId: id, auditorId: intParam(req.params["auditorId"]) });
    res.set("Cache-Control", "no-store");
    await renderSession(req, res, id, {
      invite: { name: result.auditor.name, link: inviteLink(req, result.inviteToken), expires: result.auditor.inviteExpiresAt },
    });
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

  return router;
}

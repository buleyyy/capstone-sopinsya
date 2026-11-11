import { Router, raw, type RequestHandler, type Response } from "express";
import { isInlineType, MAX_EVIDENCE_BYTES, validateEvidenceUpload } from "../../api/src/domain/evidenceFile.js";
import type { AnswerResult } from "../../api/src/domain/auditSchemas.js";
import type { FindingFollowUp } from "../../api/src/domain/auditStore.js";
import { getAuditContext } from "../../api/src/middleware/sessionAccess.js";
import { toHttpsUrl } from "../../api/src/routes/publicContent.js";
import {
  authenticateById,
  resolveAccountContext,
  resolvePasswordLogin,
  closeFinding,
  createFinding,
  createFindingWithFollowUp,
  deleteFinding,
  EMPTY_FOLLOW_UP,
  getAuditorName,
  getDocumentHeader,
  getChecklist,
  getDashboard,
  getMe,
  listFindings,
  listFindingFollowUps,
  listMyAssignments,
  listAllFindings,
  saveAnswer,
  saveDocumentHeader,
  saveFindingFollowUp,
  type AuditContext,
  type ChecklistEntry,
  type RegisterRow,
} from "../../api/src/services/auditService.js";
import { AppError } from "../../api/src/utils/errors.js";
import { renderFindingsPdf, type PdfFinding } from "../../api/src/services/findingsPdf.js";
import { requireStore, type WebDeps } from "../shared/deps.js";
import { registerStats } from "../shared/auditSummary.js";
import { field, formatDate, formatDateTime, intParam, newRequestId, todayWib, trimmed } from "../shared/helpers.js";
import { UNBOUND_AUDITOR_ID } from "../shared/security.js";

const queryString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** Kolom tindak lanjut/verifikasi yang dapat diisi lewat formulir (urutan tidak berpengaruh). */
const FOLLOW_UP_KEYS: (keyof FindingFollowUp)[] = [
  "rootCause",
  "correction",
  "correctionPic",
  "correctionTarget",
  "correctionEvidenceUrl",
  "correctiveAction",
  "correctiveActionPic",
  "correctiveActionTarget",
  "correctiveActionEvidenceUrl",
  "improvementAction",
  "improvementPic",
  "improvementTarget",
  "improvementEvidenceUrl",
  "auditeeName",
  "reportedDate",
  "followedUpDate",
  "verifiedDate",
  "verifierName",
  "verificationResult",
];

const FINDING_KEYS = [
  "clientRequestId",
  "assignmentId",
  "classification",
  "problem",
  "location",
  "objectiveEvidence",
  "reference",
  "note",
  "evidenceUrl",
] as const;

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined =>
  allowed.find((a) => a === value);

/** Kelompok isian per kategori: Major/Minor memakai CAPA, Observasi memakai tindakan peningkatan. */
const CAPA_KEYS: (keyof FindingFollowUp)[] = [
  "rootCause",
  "correction",
  "correctionPic",
  "correctionTarget",
  "correctionEvidenceUrl",
  "correctiveAction",
  "correctiveActionPic",
  "correctiveActionTarget",
  "correctiveActionEvidenceUrl",
];
const IMPROVEMENT_KEYS: (keyof FindingFollowUp)[] = ["improvementAction", "improvementPic", "improvementTarget", "improvementEvidenceUrl"];

/** Teks gabungan untuk pencarian (uraian, klausul/rujukan, PIC, unit, kode). */
function searchText(r: RegisterRow): string {
  const f = r.finding;
  const u = r.followUp;
  return [
    r.code, r.departmentName, f.problem, f.location, f.objectiveEvidence, f.reference,
    u.rootCause, u.correction, u.correctionPic, u.correctiveAction, u.correctiveActionPic,
    u.improvementAction, u.improvementPic, u.auditeeName, u.verifierName,
  ].filter(Boolean).join(" ").toLowerCase();
}

/** Tanggal formulir YYYY-MM-DD terawal/terakhir dari daftar (urutan teks = urutan tanggal). */
function edgeDate(values: (string | null)[], edge: "min" | "max"): string | null {
  const v = values.filter((x): x is string => !!x).sort();
  return (edge === "min" ? v[0] : v[v.length - 1]) ?? null;
}

/** Nama berkas dari tautan bukti (https:// atau /audit/bukti/<id>/<nama>); dipakai pada PDF. */
function evidenceName(url: string | null): string | null {
  if (!url) return null;
  try {
    const seg = new URL(url, "https://tautan.invalid").pathname.split("/").filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : url;
  } catch {
    return url;
  }
}

function validationMessages(err: AppError): { path: string; message: string }[] {
  return Array.isArray(err.details) ? (err.details as { path: string; message: string }[]) : [{ path: "", message: err.message }];
}

/** Halaman Auditor: checklist, register temuan, dashboard, dan Pustaka SOP. */
export function createAuditorRouter(deps: WebDeps): Router {
  const router = Router();
  const { sec } = deps;

  // Masuk (email + kata sandi) ditangani gerbang bersama di loginRoutes.ts.

  // ---------- Area Auditor (wajib sesi) ----------

  const auth: RequestHandler = async (req, res, next) => {
    try {
      const store = requireStore(deps);
      const bound = sec.auditorBinding(req);
      if (!bound) throw new AppError(401, "UNAUTHENTICATED", "Sesi login tidak valid");
      // Status sesi dan auditor dibaca ulang dari database pada setiap request.
      let ctx: AuditContext;
      const now = new Date();
      // Cookie akun database: akun harus aktif dan ber-role AUDITOR (dibaca ulang tiap request, sehingga penonaktifan
      // langsung berlaku). Sesi yang dipakai hanya penugasan MILIK akun ini (resolveAccountContext).
      const accountId = bound.userId;
      if (accountId !== null) {
        const account = deps.accounts ? await deps.accounts.findById(accountId) : null;
        if (!account || !account.isActive || account.role !== "AUDITOR") {
          sec.clearAuditorCookie(res);
          throw new AppError(401, "UNAUTHENTICATED", "Sesi login tidak valid");
        }
      }
      if (accountId !== null || bound.auditorId === UNBOUND_AUDITOR_ID) {
        // Akun tanpa penugasan aktif (atau login fallback tanpa sesi): cari ulang tiap request, jadi otomatis terhubung
        // setelah Admin mengaktifkan sesi dan menugaskan akun.
        try {
          ctx = accountId !== null ? await resolveAccountContext(store, accountId, now) : await resolvePasswordLogin(store, now);
        } catch (err) {
          if (err instanceof AppError && (err.statusCode === 403 || err.statusCode === 409)) {
            // Belum ada sesi audit: tetap masuk ke landing Auditor. Hanya landing, Pustaka SOP, dan keluar yang tersedia.
            res.locals["auditorNoSession"] = true;
            res.locals["csrfBinding"] = bound.binding;
            res.locals["csrf"] = sec.csrfToken(bound.binding);
            const isSop = req.path === "/sop" || req.path.startsWith("/sop/");
            if (isSop || (req.method === "POST" && req.path === "/keluar")) {
              next();
              return;
            }
            if (req.method === "GET" && (req.path === "/" || req.path === "")) {
              res.status(200).render("audit/belum-ada-sesi", { title: "Dashboard Audit" });
              return;
            }
            res.redirect(303, "/audit");
            return;
          }
          throw err;
        }
      } else {
        ctx = await authenticateById(store, bound.auditorId, now);
      }
      res.locals["audit"] = ctx;
      res.locals["csrfBinding"] = bound.binding;
      res.locals["csrf"] = sec.csrfToken(bound.binding);
      res.locals["sessionTitle"] = ctx.session.title;
      next();
    } catch (err) {
      next(err);
    }
  };
  router.use("/audit", auth);

  const assignmentId = (raw: string | string[] | undefined): number => {
    const id = intParam(raw);
    if (Number.isNaN(id)) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    return id;
  };

  router.get("/audit", async (_req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const [me, dash] = await Promise.all([getMe(store, ctx), getDashboard(store, ctx)]);
    const totals = dash.reduce(
      (t, d) => ({
        items: t.items + d.totalItems,
        answered: t.answered + d.answered,
        ya: t.ya + d.ya,
        tidak: t.tidak + d.tidak,
        major: t.major + d.findings.byClassification.MAJOR,
        minor: t.minor + d.findings.byClassification.MINOR,
        observasi: t.observasi + d.findings.byClassification.OBSERVASI,
        open: t.open + d.findings.open,
        closed: t.closed + d.findings.closed,
      }),
      { items: 0, answered: 0, ya: 0, tidak: 0, major: 0, minor: 0, observasi: 0, open: 0, closed: 0 },
    );
    const [register, header, auditorName] = await Promise.all([
      listAllFindings(store, ctx),
      getDocumentHeader(store, ctx),
      getAuditorName(store, ctx),
    ]);
    res.render("audit/beranda", {
      title: "Dashboard Audit",
      nav: "dashboard",
      me,
      dash,
      totals,
      register,
      header,
      auditorName,
      stats: registerStats(register),
    });
  });

  // ----- Checklist -----

  const renderChecklist = async (
    res: Response,
    id: number,
    opts: { entries?: ChecklistEntry[]; errors?: { itemId: number; message: string }[]; saved?: string | undefined; status?: number },
  ) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const [entries, assignments, me] = await Promise.all([
      opts.entries ? Promise.resolve(opts.entries) : getChecklist(store, ctx, id),
      listMyAssignments(store, ctx),
      getMe(store, ctx),
    ]);
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    res.status(opts.status ?? 200).render("audit/checklist", {
      title: `Checklist - ${assignment.departmentName}`,
      assignment,
      entries,
      me,
      errors: opts.errors ?? [],
      saved: opts.saved,
    });
  };

  router.get("/audit/penugasan/:id", async (req, res) => {
    await renderChecklist(res, assignmentId(req.params["id"]), { saved: queryString(req.query["tersimpan"]) });
  });

  router.post("/audit/penugasan/:id", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const id = assignmentId(req.params["id"]);
    const current = await getChecklist(store, ctx, id);

    const errors: { itemId: number; message: string }[] = [];
    const overrides = new Map<number, { result: string; note: string; evidence: string }>();
    let saved = 0;

    for (const entry of current) {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body[`result_${entry.id}`] !== "string") continue; // item tidak ada di formulir
      const result = field(req, `result_${entry.id}`);
      const note = field(req, `note_${entry.id}`).trim();
      const evidence = field(req, `evidence_${entry.id}`).trim();
      const unchanged =
        (entry.result ?? "") === result && (entry.note ?? "") === note && (entry.evidenceUrl ?? "") === evidence;
      if (unchanged) continue;
      try {
        await saveAnswer(store, ctx, id, entry.id, { result: result === "" ? null : result, note, evidenceUrl: evidence });
        saved += 1;
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        overrides.set(entry.id, { result, note, evidence });
        errors.push({
          itemId: entry.id,
          message: err.code === "VALIDATION_ERROR" ? validationMessages(err).map((m) => m.message).join("; ") : err.message,
        });
        if (err.statusCode === 403) break; // sesi tidak bisa ditulis: sisanya pasti gagal juga
      }
    }

    if (errors.length === 0) {
      res.redirect(303, `/audit/penugasan/${id}?tersimpan=${saved}`);
      return;
    }

    const fresh = await getChecklist(store, ctx, id);
    const merged = fresh.map((e): ChecklistEntry => {
      const o = overrides.get(e.id);
      if (!o) return e;
      const result: AnswerResult | null = o.result === "YA" || o.result === "TIDAK" ? o.result : null;
      return { ...e, result, note: o.note || null, evidenceUrl: o.evidence || null };
    });
    await renderChecklist(res, id, { entries: merged, errors, saved: String(saved), status: errors.some((e) => e.message.includes("Sesi")) ? 403 : 422 });
  });

  // ----- Register Temuan -----

  const renderFindings = async (
    res: Response,
    id: number,
    opts: {
      form?: Record<string, string>;
      errors?: { path: string; message: string }[];
      created?: string | undefined;
      closed?: string | undefined;
      updated?: string | undefined;
      answerId?: number | undefined;
      status?: number;
    },
  ) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const [findings, followUpList, entries, assignments, me] = await Promise.all([
      listFindings(store, ctx, id),
      listFindingFollowUps(store, ctx, id),
      getChecklist(store, ctx, id),
      listMyAssignments(store, ctx),
      getMe(store, ctx),
    ]);
    const followUps = Object.fromEntries(followUpList.map((f) => [f.findingId, f]));
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");

    const linked = opts.answerId !== undefined ? entries.find((e) => e.answerId === opts.answerId) : undefined;
    const form = opts.form ?? {
      clientRequestId: newRequestId(),
      answerId: linked?.answerId ? String(linked.answerId) : "",
      classification: "",
      problem: "",
      location: assignment.departmentName,
      objectiveEvidence: linked?.note ?? "",
      reference: linked?.reference ?? "",
      note: "",
      evidenceUrl: linked?.evidenceUrl ?? "",
    };

    res.status(opts.status ?? 200).render("audit/temuan", {
      title: `Register Temuan - ${assignment.departmentName}`,
      assignment,
      findings: findings.map((f) => ({ ...f, code: `T-${f.sessionId}-${f.seq}` })),
      followUps,
      answerOptions: entries.filter((e) => e.result === "TIDAK" && e.answerId !== null),
      linked,
      form,
      errors: opts.errors ?? [],
      created: opts.created,
      closed: opts.closed,
      updated: opts.updated,
      me,
    });
  };

  router.get("/audit/penugasan/:id/temuan", async (req, res) => {
    const answer = intParam(queryString(req.query["answerId"]));
    await renderFindings(res, assignmentId(req.params["id"]), {
      created: queryString(req.query["dibuat"]),
      closed: queryString(req.query["ditutup"]),
      updated: queryString(req.query["diperbarui"]),
      answerId: Number.isNaN(answer) ? undefined : answer,
    });
  });

  router.post("/audit/penugasan/:id/temuan", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const id = assignmentId(req.params["id"]);
    const form = {
      clientRequestId: trimmed(req, "clientRequestId"),
      answerId: trimmed(req, "answerId"),
      classification: trimmed(req, "classification"),
      problem: trimmed(req, "problem"),
      location: trimmed(req, "location"),
      objectiveEvidence: trimmed(req, "objectiveEvidence"),
      reference: trimmed(req, "reference"),
      note: trimmed(req, "note"),
      evidenceUrl: trimmed(req, "evidenceUrl"),
    };
    try {
      const result = await createFinding(store, ctx, id, { ...form, answerId: form.answerId === "" ? null : Number(form.answerId) });
      const code = `T-${result.finding.sessionId}-${result.finding.seq}`;
      res.redirect(303, `/audit/penugasan/${id}/temuan?dibuat=${encodeURIComponent(code)}`);
    } catch (err) {
      if (err instanceof AppError && (err.statusCode === 422 || err.statusCode === 403)) {
        await renderFindings(res, id, { form, errors: validationMessages(err), status: err.statusCode });
        return;
      }
      throw err;
    }
  });

  router.post("/audit/temuan/:id/tindak-lanjut", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const findingId = assignmentId(req.params["id"]);
    const current = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, findingId);
    if (!current) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    // Field yang tidak ada di formulir (mis. formulir lama per unit) dipertahankan, bukan dikosongkan.
    const stored = (await listFindingFollowUps(store, ctx, current.assignmentId)).find((f) => f.findingId === current.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const merged = Object.fromEntries(
      FOLLOW_UP_KEYS.map((k) => [k, typeof body[k] === "string" ? field(req, k) : (stored?.[k] ?? "")]),
    );
    await saveFindingFollowUp(store, ctx, findingId, merged);
    const finding = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, findingId);
    if (!finding) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    const code = `T-${finding.sessionId}-${finding.seq}`;
    if (field(req, "kembali") === "daftar") {
      res.redirect(303, `/audit/temuan?diperbarui=${encodeURIComponent(code)}`);
      return;
    }
    res.redirect(303, `/audit/penugasan/${finding.assignmentId}/temuan?diperbarui=${encodeURIComponent(code)}`);
  });

  // ----- Laporan Ketidaksesuaian dan Tindakan Korektif (cetak / simpan PDF dari peramban) -----

  router.get("/audit/penugasan/:id/laporan", async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const id = assignmentId(req.params["id"]);
    const [findings, followUpList, assignments, me, auditor] = await Promise.all([
      listFindings(store, ctx, id),
      listFindingFollowUps(store, ctx, id),
      listMyAssignments(store, ctx),
      getMe(store, ctx),
      store.findAuditor(ctx.sessionId, ctx.auditorId),
    ]);
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    const followUps = Object.fromEntries(followUpList.map((f) => [f.findingId, f]));
    const count = (c: string) => findings.filter((f) => f.classification === c).length;
    res.render("audit/laporan", {
      title: `Laporan Ketidaksesuaian - ${assignment.departmentName}`,
      assignment,
      findings: findings.map((f) => ({ ...f, code: `T-${f.sessionId}-${f.seq}` })),
      followUps,
      counts: { major: count("MAJOR"), minor: count("MINOR"), observasi: count("OBSERVASI") },
      auditorName: auditor?.name ?? "Auditor",
      printedAt: new Date(),
      me,
    });
  });

  router.post("/audit/temuan/:id/tutup", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const findingId = assignmentId(req.params["id"]);
    const result = await closeFinding(store, ctx, findingId, { note: trimmed(req, "note") });
    const code = `T-${result.finding.sessionId}-${result.finding.seq}`;
    if (field(req, "kembali") === "daftar") {
      res.redirect(303, `/audit/temuan?ditutup=${encodeURIComponent(code)}`);
      return;
    }
    res.redirect(303, `/audit/penugasan/${result.finding.assignmentId}/temuan?ditutup=${encodeURIComponent(code)}`);
  });

  // ----- Daftar Temuan (lintas unit) -----

  /**
   * Daftar Temuan. `extra` menambah/menimpa data tampilan; modal Tambah/Ubah Temuan dirender di atas daftar ini
   * sebagai halaman server (berfungsi tanpa JavaScript); menutupnya = kembali ke /audit/temuan.
   */
  const renderRegister = async (
    res: Response,
    query: Record<string, unknown>,
    extra: Record<string, unknown> = {},
    status = 200,
  ) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const [register, me, assignments, auditorName] = await Promise.all([
      listAllFindings(store, ctx),
      getMe(store, ctx),
      listMyAssignments(store, ctx),
      getAuditorName(store, ctx),
    ]);
    const q = (queryString(query["q"]) ?? "").trim().slice(0, 100);
    const kat = oneOf(queryString(query["kat"]), ["MAJOR", "MINOR", "OBSERVASI"] as const);
    const statusFilter = oneOf(queryString(query["status"]), ["OPEN", "CLOSED"] as const);
    const unit = intParam(queryString(query["unit"]));
    const needle = q.toLowerCase();
    const rows = register.filter(
      (r) =>
        (!kat || r.finding.classification === kat) &&
        (!statusFilter || r.finding.status === statusFilter) &&
        (Number.isNaN(unit) || r.assignmentId === unit) &&
        (needle === "" || searchText(r).includes(needle)),
    );
    res.status(status).render("audit/temuan-daftar", {
      title: "Daftar Temuan",
      nav: "temuan",
      me,
      rows,
      total: register.length,
      assignments,
      auditorName,
      filter: { q, kat: kat ?? "", status: statusFilter ?? "", unit: Number.isNaN(unit) ? "" : String(unit) },
      created: queryString(query["dibuat"]),
      updated: queryString(query["diperbarui"]),
      closed: queryString(query["ditutup"]),
      deleted: queryString(query["dihapus"]),
      modal: null,
      form: {},
      errors: [],
      ...extra,
    });
  };

  router.get("/audit/temuan", async (req, res) => {
    await renderRegister(res, req.query as Record<string, unknown>);
  });

  // ----- Tambah Temuan (lengkap dengan tindak lanjut dan verifikasi) -----

  const renderNewFinding = async (
    res: Response,
    opts: { form?: Record<string, string>; errors?: { path: string; message: string }[]; status?: number; unit?: string },
  ) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const assignments = await listMyAssignments(store, ctx);
    const form: Record<string, string> = opts.form ?? {
      ...Object.fromEntries([...FINDING_KEYS, ...FOLLOW_UP_KEYS].map((k) => [k, ""])),
      status: "OPEN",
      clientRequestId: newRequestId(),
      assignmentId: opts.unit ?? (assignments.length === 1 ? String(assignments[0]?.id ?? "") : ""),
      reportedDate: todayWib(),
    };
    await renderRegister(res, {}, { title: "Tambah Temuan", modal: "baru", form, errors: opts.errors ?? [] }, opts.status ?? 200);
  };

  router.get("/audit/temuan/baru", async (req, res) => {
    const unit = intParam(queryString(req.query["unit"]));
    await renderNewFinding(res, Number.isNaN(unit) ? {} : { unit: String(unit) });
  });

  router.post("/audit/temuan/baru", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const form: Record<string, string> = Object.fromEntries(
      [...FINDING_KEYS, ...FOLLOW_UP_KEYS, "status"].map((k) => [k, trimmed(req, k)]),
    );
    const unitId = intParam(form["assignmentId"]);
    if (Number.isNaN(unitId)) {
      await renderNewFinding(res, { form, errors: [{ path: "assignmentId", message: "Pilih unit yang diaudit" }], status: 422 });
      return;
    }
    // Formulir dinamis: isian kelompok yang tidak berlaku untuk kategori terpilih dibuang di server
    // (bila peramban tidak menyembunyikannya), agar tidak ditolak aturan Observasi vs Major/Minor.
    const followUpInput: Record<string, string> = Object.fromEntries(FOLLOW_UP_KEYS.map((k) => [k, form[k] ?? ""]));
    for (const k of form["classification"] === "OBSERVASI" ? CAPA_KEYS : IMPROVEMENT_KEYS) followUpInput[k] = "";
    try {
      const result = await createFindingWithFollowUp(
        store,
        ctx,
        unitId,
        {
          clientRequestId: form["clientRequestId"],
          answerId: null,
          classification: form["classification"],
          problem: form["problem"],
          location: form["location"],
          objectiveEvidence: form["objectiveEvidence"],
          reference: form["reference"],
          note: form["note"],
          evidenceUrl: form["evidenceUrl"],
        },
        followUpInput,
      );
      // Status verifikasi "Closed" saat tambah: temuan langsung ditutup dengan catatan verifikator (jejak riwayat tetap dibuat).
      if (result.created && form["status"] === "CLOSED") {
        await closeFinding(store, ctx, result.finding.id, { note: (form["verificationResult"] ?? "").slice(0, 2000) });
      }
      const code = `T-${result.finding.sessionId}-${result.finding.seq}`;
      res.redirect(303, `/audit/temuan?dibuat=${encodeURIComponent(code)}`);
    } catch (err) {
      if (err instanceof AppError && (err.statusCode === 422 || err.statusCode === 403)) {
        await renderNewFinding(res, { form, errors: validationMessages(err), status: err.statusCode });
        return;
      }
      throw err;
    }
  });

  // ----- Ubah tindak lanjut dan verifikasi satu temuan -----

  router.get("/audit/temuan/:id/ubah", async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const id = assignmentId(req.params["id"]);
    const finding = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, id);
    if (!finding) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    const [followUps, assignments] = await Promise.all([
      listFindingFollowUps(store, ctx, finding.assignmentId),
      listMyAssignments(store, ctx),
    ]);
    const code = `T-${finding.sessionId}-${finding.seq}`;
    await renderRegister(res, {}, {
      title: `Ubah Temuan ${code}`,
      modal: "ubah",
      finding,
      code,
      followUp: followUps.find((f) => f.findingId === finding.id) ?? EMPTY_FOLLOW_UP,
      departmentName: assignments.find((a) => a.id === finding.assignmentId)?.departmentName ?? "-",
    });
  });

  // ----- Hapus temuan (hapus lunak): konfirmasi dulu, lalu eksekusi -----

  router.get("/audit/temuan/:id/hapus", async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const id = assignmentId(req.params["id"]);
    const finding = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, id);
    if (!finding) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    const assignments = await listMyAssignments(store, ctx);
    const code = `T-${finding.sessionId}-${finding.seq}`;
    await renderRegister(res, {}, {
      title: `Hapus Temuan ${code}`,
      modal: "hapus",
      finding,
      code,
      departmentName: assignments.find((a) => a.id === finding.assignmentId)?.departmentName ?? "-",
    });
  });

  router.post("/audit/temuan/:id/hapus", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const result = await deleteFinding(store, ctx, assignmentId(req.params["id"]));
    const code = `T-${result.finding.sessionId}-${result.finding.seq}`;
    res.redirect(303, `/audit/temuan?dihapus=${encodeURIComponent(code)}`);
  });

  // ----- Cetak Hasil (formulir resmi, semua unit atau satu unit) dan header dokumen -----

  /** Data Cetak Hasil, dipakai bersama oleh pratinjau HTML dan PDF server agar isinya tidak bisa berbeda. */
  const loadPrintData = async (res: Response, query: Record<string, unknown>) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const [register, header, auditorName, assignments, me] = await Promise.all([
      listAllFindings(store, ctx),
      getDocumentHeader(store, ctx),
      getAuditorName(store, ctx),
      listMyAssignments(store, ctx),
      getMe(store, ctx),
    ]);
    const unit = intParam(queryString(query["unit"]));
    const rows = Number.isNaN(unit) ? register : register.filter((r) => r.assignmentId === unit);
    const unitName = Number.isNaN(unit) ? "Semua unit" : (assignments.find((a) => a.id === unit)?.departmentName ?? "Semua unit");
    const count = (c: string) => rows.filter((r) => r.finding.classification === c).length;
    const names = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => !!v))];
    return {
      me,
      rows,
      header,
      auditorName,
      assignments,
      unit: Number.isNaN(unit) ? "" : String(unit),
      unitName,
      counts: { major: count("MAJOR"), minor: count("MINOR"), observasi: count("OBSERVASI") },
      summary: {
        reportedDate: edgeDate(rows.map((r) => r.followUp.reportedDate), "min"),
        followedUpDate: edgeDate(rows.map((r) => r.followUp.followedUpDate), "max"),
        verifiedDate: edgeDate(rows.map((r) => r.followUp.verifiedDate), "max"),
        auditees: names(rows.map((r) => r.followUp.auditeeName)),
        verifiers: names(rows.map((r) => r.followUp.verifierName)),
      },
    };
  };

  /** Cetak Hasil. `extra` dipakai untuk menampilkan modal Pengaturan Header Dokumen di atas pratinjau. */
  const renderPrint = async (
    res: Response,
    query: Record<string, unknown>,
    extra: Record<string, unknown> = {},
    status = 200,
  ) => {
    const data = await loadPrintData(res, query);
    res.status(status).render("audit/cetak", {
      title: "Cetak Hasil",
      nav: "cetak",
      ...data,
      printedAt: new Date(),
      saved: queryString(query["header"]),
      headerModal: false,
      form: {},
      errors: [],
      ...extra,
    });
  };

  router.get("/audit/cetak", async (req, res) => {
    await renderPrint(res, req.query as Record<string, unknown>);
  });

  // PDF dibuat di server dari data yang sama dengan pratinjau Cetak Hasil (tidak bergantung pada fitur cetak peramban).
  router.get("/audit/cetak.pdf", async (req, res) => {
    const data = await loadPrintData(res, req.query as Record<string, unknown>);
    const findings: PdfFinding[] = data.rows.map((r) => {
      const f = r.finding;
      const u = r.followUp;
      return {
        code: r.code,
        classification: f.classification,
        status: f.status,
        reference: f.reference,
        problem: f.problem,
        location: f.location,
        objectiveEvidence: f.objectiveEvidence,
        closedAtLabel: f.closedAt ? formatDateTime(f.closedAt) : null,
        rootCause: u.rootCause,
        correction: u.correction,
        correctionPic: u.correctionPic,
        correctionTarget: u.correctionTarget,
        correctionEvidenceName: evidenceName(u.correctionEvidenceUrl),
        correctiveAction: u.correctiveAction,
        correctiveActionPic: u.correctiveActionPic,
        correctiveActionTarget: u.correctiveActionTarget,
        correctiveActionEvidenceName: evidenceName(u.correctiveActionEvidenceUrl),
        improvementAction: u.improvementAction,
        improvementPic: u.improvementPic,
        improvementTarget: u.improvementTarget,
        improvementEvidenceName: evidenceName(u.improvementEvidenceUrl),
        verificationResult: u.verificationResult,
        verifiedDateLabel: u.verifiedDate ? formatDate(u.verifiedDate) : null,
      };
    });
    const s = data.summary;
    const pdf = await renderFindingsPdf({
      header: data.header,
      sessionTitle: res.locals["sessionTitle"] as string,
      unitName: data.unitName,
      auditorName: data.auditorName,
      printedAtLabel: formatDateTime(new Date()),
      findings,
      counts: data.counts,
      reportedDateLabel: s.reportedDate ? formatDate(s.reportedDate) : null,
      followedUpDateLabel: s.followedUpDate ? formatDate(s.followedUpDate) : null,
      verifiedDateLabel: s.verifiedDate ? formatDate(s.verifiedDate) : null,
      auditees: s.auditees,
      verifiers: s.verifiers,
    });
    const slug = data.unitName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "Semua-unit";
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Laporan-Ketidaksesuaian-${slug}-${todayWib()}.pdf"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    });
    res.send(pdf);
  });

  const renderHeaderForm = async (
    res: Response,
    opts: { form?: Record<string, string>; errors?: { path: string; message: string }[]; status?: number },
  ) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const header = await getDocumentHeader(store, ctx);
    await renderPrint(
      res,
      {},
      { headerModal: true, form: opts.form ?? { ...header }, errors: opts.errors ?? [] },
      opts.status ?? 200,
    );
  };

  router.get("/audit/cetak/header", async (_req, res) => {
    await renderHeaderForm(res, {});
  });

  router.post("/audit/cetak/header", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const form: Record<string, string> = {
      organization: trimmed(req, "organization"),
      subtitle: trimmed(req, "subtitle"),
      formTitle: trimmed(req, "formTitle"),
      formCode: trimmed(req, "formCode"),
      revision: trimmed(req, "revision"),
      issuedAt: trimmed(req, "issuedAt"),
    };
    try {
      await saveDocumentHeader(store, ctx, form);
      res.redirect(303, "/audit/cetak?header=tersimpan");
    } catch (err) {
      if (err instanceof AppError && (err.statusCode === 422 || err.statusCode === 403)) {
        await renderHeaderForm(res, { form, errors: validationMessages(err), status: err.statusCode });
        return;
      }
      throw err;
    }
  });

  // ----- Berkas bukti (unggah lewat JavaScript; tautan https tetap bisa ditempel tanpa JS) -----

  /** Token CSRF untuk unggah dikirim lewat header karena badan permintaan berupa berkas mentah. */
  const requireCsrfHeader: RequestHandler = (req, res, next) => {
    const binding = res.locals["csrfBinding"] as string | undefined;
    if (!binding || !sec.isValidCsrf(binding, req.get("x-csrf-token"))) {
      res.status(403).json({ error: "Sesi formulir kedaluwarsa. Muat ulang halaman lalu coba lagi." });
      return;
    }
    next();
  };

  router.post(
    "/audit/bukti",
    sec.checkOrigin,
    requireCsrfHeader,
    raw({ type: "application/octet-stream", limit: MAX_EVIDENCE_BYTES }),
    async (req, res) => {
      try {
        const store = requireStore(deps);
        const ctx = getAuditContext(res);
        if (!deps.evidence) throw new AppError(503, "DB_NOT_CONFIGURED", "Penyimpanan berkas belum tersedia");
        if (!(await getMe(store, ctx)).canWrite) {
          throw new AppError(403, "SESSION_NOT_WRITABLE", "Sesi tidak menerima perubahan lagi");
        }
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        let rawName = req.get("x-filename") ?? "";
        try {
          rawName = decodeURIComponent(rawName);
        } catch {
          /* nama tidak ter-encode: pakai apa adanya */
        }
        const meta = validateEvidenceUpload(rawName, body);
        const saved = await deps.evidence.save({
          sessionId: ctx.sessionId,
          fileName: meta.fileName,
          contentType: meta.contentType,
          data: body,
        });
        res.status(201).json({ url: `/audit/bukti/${saved.id}/${encodeURIComponent(meta.fileName)}`, name: meta.fileName });
      } catch (err) {
        if (err instanceof AppError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        console.error("[web] unggah bukti gagal:", err);
        res.status(500).json({ error: "Gagal menyimpan berkas. Coba lagi." });
      }
    },
  );

  router.get(["/audit/bukti/:id", "/audit/bukti/:id/:name"], async (req, res) => {
    const ctx = getAuditContext(res);
    const id = assignmentId(req.params["id"]);
    if (!deps.evidence) throw new AppError(503, "DB_NOT_CONFIGURED", "Penyimpanan berkas belum tersedia");
    const file = await deps.evidence.get(ctx.sessionId, id); // hanya berkas pada sesi auditor ini
    if (!file) throw new AppError(404, "NOT_FOUND", "Berkas tidak ditemukan");
    const safeName = encodeURIComponent(file.fileName);
    res.set({
      "Content-Type": file.contentType,
      "Content-Disposition": `${isInlineType(file.contentType) ? "inline" : "attachment"}; filename*=UTF-8''${safeName}`,
      "Content-Length": String(file.data.length),
    });
    res.send(file.data);
  });

  // ----- Pustaka SOP (hanya dokumen yang dipublikasikan) -----

  router.get("/audit/sop", async (_req, res) => {
    const rooms = deps.publicContent ? await deps.publicContent.listRooms() : [];
    res.render("audit/sop", { title: "Pustaka SOP", rooms, room: null });
  });

  router.get("/audit/sop/:id", async (req, res) => {
    const id = intParam(req.params["id"]);
    const room = deps.publicContent && !Number.isNaN(id) ? await deps.publicContent.getRoom(id) : null;
    if (!room) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
    res.render("audit/sop", {
      title: room.name,
      rooms: [],
      room: { ...room, documents: room.documents.map((d) => ({ ...d, url: toHttpsUrl(d.url) })) },
    });
  });

  // ----- Keluar -----

  router.post("/audit/keluar", sec.checkOrigin, sec.requireCsrf, (_req, res) => {
    // Cookie bertanda tangan: keluar cukup menghapus cookie di peramban ini (peserta lain pada akun yang sama tidak terpengaruh).
    sec.clearAuditorCookie(res);
    res.redirect(303, "/masuk");
  });

  return router;
}

import { Router, type RequestHandler, type Response } from "express";
import type { AnswerResult } from "../domain/auditSchemas.js";
import { getAuditContext, readCookie, SESSION_COOKIE } from "../middleware/sessionAccess.js";
import { toHttpsUrl } from "../routes/publicContent.js";
import {
  authenticate,
  closeFinding,
  createFinding,
  getChecklist,
  getDashboard,
  getMe,
  listFindings,
  listFindingFollowUps,
  listMyAssignments,
  saveAnswer,
  saveFindingFollowUp,
  logout as logoutAuditor,
  type AuditContext,
  type ChecklistEntry,
} from "../services/auditService.js";
import { AppError } from "../utils/errors.js";
import { requireStore, type WebDeps } from "./deps.js";
import { field, intParam, newRequestId, trimmed } from "./helpers.js";

const queryString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

function validationMessages(err: AppError): { path: string; message: string }[] {
  return Array.isArray(err.details) ? (err.details as { path: string; message: string }[]) : [{ path: "", message: err.message }];
}

/** Halaman Auditor: checklist, register temuan, dashboard, dan Pustaka SOP. */
export function createAuditorRouter(deps: WebDeps): Router {
  const router = Router();
  const { sec } = deps;

  // Akses Auditor hanya melalui token sesi yang diterbitkan setelah undangan individual diklaim.

  // ---------- Area Auditor (wajib sesi) ----------

  const auth: RequestHandler = async (req, res, next) => {
    try {
      const store = requireStore(deps);
      const token = readCookie(req.header("cookie"), SESSION_COOKIE);
      if (!token) throw new AppError(401, "UNAUTHENTICATED", "Sesi login tidak valid");
      // Undangan individual menghasilkan token acak; hanya hash-nya yang tersimpan di database.
      // Status sesi, auditor, dan masa akses diperiksa ulang pada setiap request.
      const ctx: AuditContext = await authenticate(store, token, new Date());
      res.locals["audit"] = ctx;
      res.locals["csrfBinding"] = token;
      res.locals["csrf"] = sec.csrfToken(token);
      res.locals["sessionTitle"] = ctx.session.title;
      next();
    } catch (err) {
      next(err);
    }
  };
  router.use("/auditor", auth);

  const assignmentId = (raw: string | string[] | undefined): number => {
    const id = intParam(raw);
    if (Number.isNaN(id)) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    return id;
  };

  router.get("/auditor", async (_req, res) => {
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
    res.render("auditor/beranda", { title: "Dashboard Audit", me, dash, totals });
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
    res.status(opts.status ?? 200).render("auditor/checklist", {
      title: `Checklist - ${assignment.departmentName}`,
      assignment,
      entries,
      me,
      errors: opts.errors ?? [],
      saved: opts.saved,
    });
  };

  router.get("/auditor/penugasan/:id", async (req, res) => {
    await renderChecklist(res, assignmentId(req.params["id"]), { saved: queryString(req.query["tersimpan"]) });
  });

  router.post("/auditor/penugasan/:id", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
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
      res.redirect(303, `/auditor/penugasan/${id}?tersimpan=${saved}`);
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

    res.status(opts.status ?? 200).render("auditor/temuan", {
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

  router.get("/auditor/penugasan/:id/temuan", async (req, res) => {
    const answer = intParam(queryString(req.query["answerId"]));
    await renderFindings(res, assignmentId(req.params["id"]), {
      created: queryString(req.query["dibuat"]),
      closed: queryString(req.query["ditutup"]),
      updated: queryString(req.query["diperbarui"]),
      answerId: Number.isNaN(answer) ? undefined : answer,
    });
  });

  router.post("/auditor/penugasan/:id/temuan", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
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
      res.redirect(303, `/auditor/penugasan/${id}/temuan?dibuat=${encodeURIComponent(code)}`);
    } catch (err) {
      if (err instanceof AppError && (err.statusCode === 422 || err.statusCode === 403)) {
        await renderFindings(res, id, { form, errors: validationMessages(err), status: err.statusCode });
        return;
      }
      throw err;
    }
  });

  router.post("/auditor/temuan/:id/tindak-lanjut", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const findingId = assignmentId(req.params["id"]);
    await saveFindingFollowUp(store, ctx, findingId, {
      rootCause: field(req, "rootCause"),
      correction: field(req, "correction"),
      correctionPic: field(req, "correctionPic"),
      correctionTarget: field(req, "correctionTarget"),
      correctiveAction: field(req, "correctiveAction"),
      correctiveActionPic: field(req, "correctiveActionPic"),
      correctiveActionTarget: field(req, "correctiveActionTarget"),
      improvementAction: field(req, "improvementAction"),
      improvementPic: field(req, "improvementPic"),
      improvementTarget: field(req, "improvementTarget"),
    });
    const finding = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, findingId);
    if (!finding) throw new AppError(404, "NOT_FOUND", "Data tidak ditemukan");
    const code = `T-${finding.sessionId}-${finding.seq}`;
    res.redirect(303, `/auditor/penugasan/${finding.assignmentId}/temuan?diperbarui=${encodeURIComponent(code)}`);
  });

  // ----- Laporan Ketidaksesuaian dan Tindakan Korektif (cetak / simpan PDF dari peramban) -----

  router.get("/auditor/penugasan/:id/laporan", async (req, res) => {
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
    res.render("auditor/laporan", {
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

  router.post("/auditor/temuan/:id/tutup", sec.checkOrigin, sec.requireCsrf, async (req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    const findingId = assignmentId(req.params["id"]);
    const result = await closeFinding(store, ctx, findingId, { note: trimmed(req, "note") });
    const code = `T-${result.finding.sessionId}-${result.finding.seq}`;
    res.redirect(303, `/auditor/penugasan/${result.finding.assignmentId}/temuan?ditutup=${encodeURIComponent(code)}`);
  });

  // ----- Pustaka SOP (hanya dokumen yang dipublikasikan) -----

  router.get("/auditor/sop", async (_req, res) => {
    const rooms = deps.publicContent ? await deps.publicContent.listRooms() : [];
    res.render("auditor/sop", { title: "Pustaka SOP", rooms, room: null });
  });

  router.get("/auditor/sop/:id", async (req, res) => {
    const id = intParam(req.params["id"]);
    const room = deps.publicContent && !Number.isNaN(id) ? await deps.publicContent.getRoom(id) : null;
    if (!room) throw new AppError(404, "NOT_FOUND", "Programtidak ditemukan");
    res.render("auditor/sop", {
      title: room.name,
      rooms: [],
      room: { ...room, documents: room.documents.map((d) => ({ ...d, url: toHttpsUrl(d.url) })) },
    });
  });

  // ----- Keluar -----

  router.post("/auditor/keluar", sec.checkOrigin, sec.requireCsrf, async (_req, res) => {
    const store = requireStore(deps);
    const ctx = getAuditContext(res);
    await logoutAuditor(store, ctx);
    sec.clearAuditorCookie(res);
    res.redirect(303, "/masuk");
  });

  return router;
}

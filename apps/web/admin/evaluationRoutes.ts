import type { Request, Response, Router } from "express";
import { AppError } from "../../api/src/utils/errors.js";
import { requireAdminStore, type WebDeps } from "../shared/deps.js";
import { sendFile } from "../shared/files.js";
import { intParam, trimmed } from "../shared/helpers.js";
import type { CaseStudyRow, TrainingAttemptRow } from "./readStore.js";

/**
 * Peserta & Hasil Evaluasi (mockup "Hasil Evaluasi"): rekap Pre/Post-test dan tugas Studi Kasus peserta.
 * Filter "Semua Kategori" berupa centang ganda (jenis test & nama program), Ekspor ke CSV mengikuti filter
 * yang aktif, dan hapus menyembunyikan baris dari rekap (soft delete). Nilai hanya untuk Admin.
 */

/** Nilai query ganda (?type=PRE&type=POST) sebagai daftar string. */
export function queryList(req: Request, key: string): string[] {
  const v = req.query[key];
  const arr = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return arr.filter((x): x is string => typeof x === "string" && x.length <= 80);
}

/** Satu sel CSV: dikutip bila perlu, dan diberi awalan ' bila diawali =,+,-,@ (cegah formula injection di Excel). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header: string[], rows: unknown[][]): string =>
  "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"; // BOM: Excel membaca UTF-8

const wib = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" });
const wibTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const dateWib = (d: Date): string => wib.format(d);
export const timeWib = (d: Date): string => wibTime.format(d).replace(/\./g, ":");

const sendCsv = (res: Response, name: string, body: string) => {
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });
  res.send(body);
};

export function registerEvaluationRoutes(router: Router, deps: WebDeps, fallbackPrograms: { slug: string; label: string }[]): void {
  const store = () => requireAdminStore(deps);

  const programOptions = async (): Promise<{ slug: string; label: string }[]> => {
    const list = await store().listPrograms().catch(() => null);
    return list && list.length > 0 ? list.map((p) => ({ slug: p.slug, label: p.title })) : fallbackPrograms;
  };

  const readFilters = (req: Request, programs: { slug: string }[]) => {
    const slugs = new Set(programs.map((p) => p.slug));
    return {
      q: (typeof req.query["q"] === "string" ? req.query["q"] : "").trim().slice(0, 100),
      types: queryList(req, "type").filter((t) => t === "PRE" || t === "POST"),
      programs: queryList(req, "program").filter((s) => slugs.has(s)),
      cq: (typeof req.query["cq"] === "string" ? req.query["cq"] : "").trim().slice(0, 100),
      cprograms: queryList(req, "cprogram").filter((s) => slugs.has(s)),
    };
  };

  const filterAttempts = (all: TrainingAttemptRow[], f: ReturnType<typeof readFilters>) => {
    const needle = f.q.toLowerCase();
    return all.filter(
      (a) =>
        (f.types.length === 0 || f.types.includes(a.type)) &&
        (f.programs.length === 0 || f.programs.includes(a.programSlug)) &&
        (needle === "" ||
          [a.participantName, a.participantInstitution, a.participantEmail, a.participantPosition, a.participantPhone]
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
  };

  const filterCases = (all: CaseStudyRow[], f: ReturnType<typeof readFilters>) => {
    const needle = f.cq.toLowerCase();
    return all.filter(
      (c) =>
        (f.cprograms.length === 0 || f.cprograms.includes(c.programSlug)) &&
        (needle === "" ||
          [c.participantName, c.participantInstitution, c.participantEmail, c.fileName].join(" ").toLowerCase().includes(needle)),
    );
  };

  router.get("/admin/nilai-evaluasi", async (req, res) => {
    const programs = await programOptions();
    const filter = readFilters(req, programs);
    const [attempts, cases] = await Promise.all([store().listTrainingAttempts(), store().listCaseStudies()]);
    const label = new Map(programs.map((p) => [p.slug, p.label]));
    res.render("admin/nilai-evaluasi", {
      title: "Hasil Evaluasi",
      nav: "nilai-evaluasi",
      programs,
      programLabel: (slug: string) => label.get(slug) ?? slug,
      rows: filterAttempts(attempts, filter),
      total: attempts.length,
      cases: filterCases(cases, filter),
      caseTotal: cases.length,
      filter,
      query: req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "",
      saved: req.query["ok"] === "1",
      dateWib,
      timeWib,
    });
  });

  router.get("/admin/nilai-evaluasi/hasil-test.csv", async (req, res) => {
    const programs = await programOptions();
    const label = new Map(programs.map((p) => [p.slug, p.label]));
    const rows = filterAttempts(await store().listTrainingAttempts(), readFilters(req, programs));
    const body = toCsv(
      ["No", "Nama Program", "Pertemuan", "Email", "Nama Peserta", "Jabatan", "Nama Instansi", "Nomor HP", "Benar", "Total Soal", "Nilai", "Jenis Test", "Tanggal", "Waktu Kirim"],
      rows.map((a, i) => [
        i + 1, label.get(a.programSlug) ?? a.programSlug, a.meetingNo, a.participantEmail, a.participantName, a.participantPosition,
        a.participantInstitution, a.participantPhone, a.correctCount, a.totalQuestions, a.score, a.type === "PRE" ? "Pre-test" : "Post-test",
        dateWib(a.submittedAt), timeWib(a.submittedAt),
      ]),
    );
    sendCsv(res, "hasil-pre-post-test.csv", body);
  });

  router.get("/admin/nilai-evaluasi/studi-kasus.csv", async (req, res) => {
    const programs = await programOptions();
    const rows = filterCases(await store().listCaseStudies(), readFilters(req, programs));
    const body = toCsv(
      ["No", "Nama Program", "Pertemuan", "Nama Peserta", "Nama Instansi", "Email", "Tanggal", "Waktu Kirim", "File Studi Kasus"],
      rows.map((c, i) => [
        i + 1, c.programTitle, c.meetingNo, c.participantName, c.participantInstitution, c.participantEmail,
        dateWib(c.submittedAt), timeWib(c.submittedAt), c.fileName,
      ]),
    );
    sendCsv(res, "hasil-studi-kasus.csv", body);
  });

  router.post("/admin/nilai-evaluasi/test/:id/hapus", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    if (!(await store().deleteTrainingAttempt(intParam(req.params["id"])))) throw new AppError(404, "NOT_FOUND", "Hasil test tidak ditemukan");
    res.redirect(303, `/admin/nilai-evaluasi?ok=1${backQuery(req)}`);
  });

  router.post("/admin/nilai-evaluasi/studi-kasus/:id/hapus", deps.sec.checkOrigin, deps.sec.requireCsrf, async (req, res) => {
    if (!(await store().deleteCaseStudy(intParam(req.params["id"])))) throw new AppError(404, "NOT_FOUND", "Studi kasus tidak ditemukan");
    res.redirect(303, `/admin/nilai-evaluasi?ok=1${backQuery(req)}#studi-kasus`);
  });

  router.get("/admin/studi-kasus/:id/unduh", async (req, res) => {
    const id = intParam(req.params["id"]);
    const row = (await store().listCaseStudies()).find((c) => c.id === id);
    const file = row ? await store().getFile(row.fileId) : null;
    if (!row || !file || file.purpose !== "CASE_STUDY") throw new AppError(404, "NOT_FOUND", "Berkas tidak ditemukan");
    res.set("Cache-Control", "private, no-store");
    sendFile(res, file, req.query["lihat"] !== "1");
  });
}

/** Mempertahankan filter setelah hapus: formulir hapus membawa query asli di field "back" (hanya ?a=b&...). */
function backQuery(req: Request): string {
  const back = trimmed(req, "back");
  return /^\?[A-Za-z0-9_=&%+.\-]{0,500}$/.test(back) ? `&${back.slice(1).replace(/(^|&)ok=1/g, "")}` : "";
}

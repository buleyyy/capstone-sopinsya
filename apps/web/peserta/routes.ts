import { Router, type Response } from "express";
import type { WebDeps } from "../shared/deps.js";
import { loadAbout } from "../shared/aboutContent.js";
import { findMeeting, loadCatalog, loadProgram, type PubMeeting, type PubProgram } from "./programs.js";

const SLUG = /^[a-z0-9-]{1,80}$/;

interface Row {
  label: string;
  kind: "external" | "internal" | "off" | "test";
  href?: string;
  /** Untuk kind "test": pre atau post; nomor pertemuan dipakai browser untuk memanggil API tes. */
  test?: "pre" | "post";
  meeting?: number;
}
interface Section {
  id: string;
  title: string;
  rows: Row[];
}

const base = (p: PubProgram) => `/peserta/program/${p.slug}`;

function buildSections(program: PubProgram): Section[] {
  const multi = program.meetings.length > 1;
  const sfx = (m: PubMeeting) => (multi ? ` — ${m.title}` : "");

  const fromResources = (id: string, title: string, type: "SYLLABUS" | "MATERIAL" | "BLOOKET" | "SOP", off: string): Section => ({
    id,
    title,
    rows: program.meetings.flatMap((m): Row[] => {
      const items = m.resources[type];
      if (items.length === 0) return [{ label: off + sfx(m), kind: "off" }];
      return items.map((r): Row => ({ label: r.title + sfx(m), kind: "external", href: r.url }));
    }),
  });

  const tests = (id: string, title: string, test: "pre" | "post"): Section => ({
    id,
    title,
    rows: program.meetings.map((m): Row => ({ label: title + sfx(m), kind: "test", test, meeting: m.number })),
  });

  const studiKasus: Section = {
    id: "studi-kasus",
    title: "Studi Kasus",
    rows: program.meetings.map((m): Row =>
      m.resources.CASE_STUDY.length > 0
        ? { label: `Studi Kasus${sfx(m)}`, kind: "internal", href: `${base(program)}/pertemuan/${m.number}/studi-kasus` }
        : { label: `Studi Kasus${sfx(m)}`, kind: "off" },
    ),
  };

  const video: Section = {
    id: "video",
    title: "Video Referensi",
    rows: program.meetings.map((m): Row =>
      m.resources.VIDEO.length > 0
        ? {
            label: `Video Referensi (${m.resources.VIDEO.length})${sfx(m)}`,
            kind: "internal",
            href: `${base(program)}/pertemuan/${m.number}/video`,
          }
        : { label: `Video Referensi${sfx(m)}`, kind: "off" },
    ),
  };

  return [
    fromResources("silabus", "Silabus", "SYLLABUS", "Silabus"),
    fromResources("materi", "Materi", "MATERIAL", "Materi"),
    studiKasus,
    tests("pre-test", "Pre-test", "pre"),
    tests("post-test", "Post-test", "post"),
    fromResources("quiz", "Quiz Game", "BLOOKET", "Quiz Game"),
    video,
    fromResources("sop", "Pustaka SOP", "SOP", "Pustaka SOP"),
  ];
}

/** ID video YouTube dari youtu.be/ID, youtube.com/watch?v=ID, atau youtube.com/embed/ID; selain itu null. */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] ?? null;
    else if (host === "youtube.com" || host === "m.youtube.com") {
      id = u.pathname.startsWith("/embed/") ? (u.pathname.split("/")[2] ?? null) : u.searchParams.get("v");
    }
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function notFound(res: Response): void {
  res.status(404).render("peserta/tidak-ditemukan", { title: "Halaman tidak ditemukan", nav: "" });
}

/**
 * Area peserta (publik, tanpa login), server-rendered:
 *   /peserta                                          beranda + katalog program
 *   /peserta/program/:slug                            detail program (Ikuti Pelatihan, silabus, materi, tes, dst.)
 *   /peserta/program/:slug/pertemuan/:n/studi-kasus   studi kasus
 *   /peserta/program/:slug/pertemuan/:n/video         video referensi
 *   /peserta/tentang-kami
 * Tes Pre/Post dikerjakan di browser (public/peserta.js) lewat /api/public/* pada server yang sama.
 */
export function createPesertaRouter(deps: WebDeps): Router {
  const router = Router();

  // Alamat situs peserta versi Next.js lama (/program/..., /tentang-kami) dialihkan ke /peserta/...
  router.get(/^\/(program|tentang-kami)(\/.*)?$/, (req, res) => {
    res.redirect(308, `/peserta${req.originalUrl}`);
  });

  router.get("/peserta", async (req, res) => {
    const q = typeof req.query["q"] === "string" ? req.query["q"].trim().slice(0, 80) : "";
    const all = await loadCatalog(deps);
    const needle = q.toLowerCase();
    const programs = needle
      ? all.filter((p) => [p.title, p.fullTitle, p.subtitle, p.category].some((s) => s.toLowerCase().includes(needle)))
      : all;
    res.render("peserta/beranda", {
      title: "Sopinsya - Platform Pembelajaran & Pelatihan",
      nav: "program",
      programs,
      totalPrograms: all.length,
      q,
    });
  });

  router.get("/peserta/program", (_req, res) => res.redirect(303, "/peserta/#program"));

  router.get("/peserta/program/:slug", async (req, res) => {
    const slug = String(req.params["slug"]);
    const program = SLUG.test(slug) ? await loadProgram(deps, slug) : null;
    if (!program) return notFound(res);
    res.render("peserta/program", {
      title: program.fullTitle,
      nav: "program",
      program,
      sections: buildSections(program),
    });
  });

  router.get("/peserta/program/:slug/pertemuan/:n/video", async (req, res) => {
    const slug = String(req.params["slug"]);
    const n = Number(req.params["n"]);
    const program = SLUG.test(slug) ? await loadProgram(deps, slug) : null;
    const meeting = program && Number.isInteger(n) ? findMeeting(program, n) : undefined;
    if (!program || !meeting) return notFound(res);
    const videos = meeting.resources.VIDEO.map((v) => ({ title: v.title, url: v.url, embedId: youtubeId(v.url) }));
    res.render("peserta/video", { title: `Video Referensi ${program.fullTitle}`, nav: "program", program, meeting, videos });
  });

  router.get("/peserta/program/:slug/pertemuan/:n/studi-kasus", async (req, res) => {
    const slug = String(req.params["slug"]);
    const n = Number(req.params["n"]);
    const program = SLUG.test(slug) ? await loadProgram(deps, slug) : null;
    const meeting = program && Number.isInteger(n) ? findMeeting(program, n) : undefined;
    if (!program || !meeting) return notFound(res);
    const docs = meeting.resources.CASE_STUDY.map((d) => ({
      title: d.title,
      url: d.url,
      type: d.url.includes("/drive/folders/") ? "Folder Google Drive" : "Dokumen",
    }));
    res.render("peserta/studi-kasus", { title: `Studi Kasus ${program.fullTitle}`, nav: "program", program, meeting, docs });
  });

  router.get("/peserta/tentang-kami", async (_req, res) => {
    // Isi diedit Admin di /admin/pengaturan; tanpa data tersimpan dipakai teks bawaan.
    const about = await loadAbout(deps.admin);
    res.render("peserta/tentang-kami", { title: "Tentang Kami", nav: "tentang", about });
  });

  return router;
}

import { toHttpsUrl } from "../../api/src/routes/publicContent.js";
import type { MeetingResourceKind, ProgramDetailRow } from "../admin/readStore.js";
import type { WebDeps } from "../shared/deps.js";
import { PUBLIC_FILE_PATH } from "../shared/files.js";

/**
 * Data program untuk halaman peserta (publik, tanpa login).
 *
 * Sumber utama: Kelola Program di Admin (TrainingProgram, ProgramMeeting, MeetingResource), hanya yang berstatus
 * Published dan isPublished. Bila database belum dikonfigurasi (deps.admin kosong), dipakai data bawaan di bawah
 * (disalin dari versi Next.js lama) agar halaman peserta tetap dapat dibuka saat development.
 * Hanya tautan https yang diteruskan ke tampilan.
 */

export type Tone = "blue" | "teal" | "navy";

export interface PubResource {
  id: number;
  title: string;
  url: string;
}
export type ResourceGroups = Record<MeetingResourceKind, PubResource[]>;

export interface PubMeeting {
  number: number;
  title: string;
  resources: ResourceGroups;
}

export interface PubProgram {
  slug: string;
  code: string;
  title: string;
  fullTitle: string;
  subtitle: string;
  summary: string;
  description: string;
  duration: string;
  mode: string;
  trainer: string;
  category: string;
  tone: Tone;
  /** Sampul dari Admin (/berkas/... atau https://); null = ilustrasi bawaan. */
  coverUrl?: string | null;
  meetings: PubMeeting[];
}

const emptyGroups = (): ResourceGroups => ({ SOP: [], SYLLABUS: [], MATERIAL: [], CASE_STUDY: [], BLOOKET: [], VIDEO: [] });

const toTone = (v: string): Tone => (v === "teal" || v === "navy" ? v : "blue");

function toPublic(d: ProgramDetailRow): PubProgram {
  const meetings = d.meetings
    .filter((m) => m.isPublished)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number)
    .map((m): PubMeeting => {
      const groups = emptyGroups();
      const resources = m.resources.filter((r) => r.isPublished).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      for (const r of resources) {
        const url = PUBLIC_FILE_PATH.test(r.url) ? r.url : toHttpsUrl(r.url); // berkas unggahan Admin atau https
        if (url) groups[r.type].push({ id: r.id, title: r.title, url });
      }
      return { number: m.number, title: m.title, resources: groups };
    });
  return {
    slug: d.slug,
    code: d.code,
    title: d.title,
    fullTitle: d.fullTitle,
    subtitle: d.subtitle,
    summary: d.summary,
    description: d.description,
    duration: d.duration,
    mode: d.mode,
    trainer: d.trainer,
    category: d.category,
    tone: toTone(d.tone),
    coverUrl: d.coverUrl && PUBLIC_FILE_PATH.test(d.coverUrl) ? d.coverUrl : null, // CSP img-src self: hanya unggahan
    meetings,
  };
}

const isLive = (d: ProgramDetailRow): boolean => d.isPublished && d.status === "PUBLISHED";

/** Katalog: semua program yang dipublikasikan, berurutan sortOrder lalu id. */
export async function loadCatalog(deps: WebDeps): Promise<PubProgram[]> {
  const admin = deps.admin;
  if (!admin) return FALLBACK;
  const rows = (await admin.listPrograms()).filter((p) => p.isPublished && p.status === "PUBLISHED");
  const details = await Promise.all(rows.map((r) => admin.getProgram(r.id)));
  return details.filter((d): d is ProgramDetailRow => d !== null && isLive(d)).map(toPublic);
}

/** Satu program menurut slug; null bila tidak ada atau belum dipublikasikan (keduanya dijawab sama: tidak ditemukan). */
export async function loadProgram(deps: WebDeps, slug: string): Promise<PubProgram | null> {
  const admin = deps.admin;
  if (!admin) return FALLBACK.find((p) => p.slug === slug) ?? null;
  const ref = await admin.findProgramBySlug(slug);
  if (!ref) return null;
  const d = await admin.getProgram(ref.id);
  return d && isLive(d) ? toPublic(d) : null;
}

export function findMeeting(program: PubProgram, number: number): PubMeeting | undefined {
  return program.meetings.find((m) => m.number === number);
}

// ---------- Data bawaan (hanya dipakai bila database belum dikonfigurasi) ----------

/** Tautan resmi dari Linktree klien (https://linktr.ee/Sopinsya_Konsultasi_SMAP). */
const LINKS = {
  materi: "https://drive.google.com/drive/folders/1AmQvrqtKZ5GD_TvkCW9aId20lagPufvQ?usp=sharing",
  blooket: "https://play.blooket.com/play",
  studiKasus: "https://drive.google.com/drive/folders/1Ac4qtHwp29A3ULBYimJ8MGYmxrssGTFd?usp=sharing",
  video: "https://youtu.be/TxuysbLRnEk",
} as const;

function makeMeetings(code: string): PubMeeting[] {
  return [1, 2].map((n) => {
    const groups = emptyGroups();
    groups.MATERIAL.push({ id: n * 10 + 1, title: `Materi Pelatihan ${code}`, url: LINKS.materi });
    groups.CASE_STUDY.push({ id: n * 10 + 2, title: `Studi Kasus ${code}`, url: LINKS.studiKasus });
    groups.BLOOKET.push({ id: n * 10 + 3, title: "Quiz Game", url: LINKS.blooket });
    groups.VIDEO.push({ id: n * 10 + 4, title: "Video 1", url: LINKS.video });
    return { number: n, title: `Pertemuan ${n}`, resources: groups };
  });
}

const FALLBACK: PubProgram[] = [
  {
    slug: "iso-9001",
    code: "01",
    title: "ISO 9001",
    fullTitle: "ISO 9001: 2015",
    subtitle: "Sistem Manajemen Mutu",
    summary: "Fokus pada kualitas proses dan kepuasan pelanggan.",
    description:
      "Pelatihan ini membahas persyaratan sistem manajemen mutu, penerapannya pada proses kerja, serta cara mengevaluasi pemenuhan persyaratan secara berkala.",
    duration: "3 Hari",
    mode: "Offline",
    trainer: "Ahmad Fadillah",
    category: "ISO 9001",
    tone: "blue",
    meetings: makeMeetings("ISO 9001"),
  },
  {
    slug: "iso-14001",
    code: "02",
    title: "ISO 14001",
    fullTitle: "ISO 14001: 2015",
    subtitle: "Sistem Manajemen Lingkungan",
    summary: "Pahami pengelolaan dampak lingkungan.",
    description:
      "Pelatihan ini membahas pengelolaan aspek dan dampak lingkungan, kewajiban kepatuhan, serta penerapan sistem manajemen lingkungan di organisasi.",
    duration: "3 Hari",
    mode: "Offline",
    trainer: "Ahmad Fadillah",
    category: "ISO 14001",
    tone: "teal",
    meetings: makeMeetings("ISO 14001"),
  },
  {
    slug: "iso-45001",
    code: "03",
    title: "ISO 45001",
    fullTitle: "ISO 45001: 2018",
    subtitle: "Kesehatan & Keselamatan Kerja",
    summary: "Bangun lingkungan kerja yang lebih aman.",
    description:
      "Pelatihan ini membahas identifikasi bahaya, penilaian risiko, dan pengendalian operasional untuk membangun lingkungan kerja yang lebih aman.",
    duration: "3 Hari",
    mode: "Offline",
    trainer: "Ahmad Fadillah",
    category: "ISO 45001",
    tone: "navy",
    meetings: makeMeetings("ISO 45001"),
  },
  {
    slug: "iso-37001",
    code: "04",
    title: "ISO 37001",
    fullTitle: "ISO 37001: 2025",
    subtitle: "Sistem Manajemen Anti Penyuapan",
    summary: "Kenali pendekatan pencegahan penyuapan.",
    description:
      "Pelatihan ini membekali peserta dengan pemahaman Sistem Manajemen Anti Penyuapan (SMAP) berdasarkan ISO 37001, mulai dari konteks organisasi dan penilaian risiko penyuapan hingga pelaksanaan audit internal dan pencatatan temuan.",
    duration: "3 Hari",
    mode: "Offline",
    trainer: "Ahmad Fadillah",
    category: "ISO 37001",
    tone: "navy",
    meetings: makeMeetings("ISO 37001"),
  },
];

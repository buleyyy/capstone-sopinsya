/**
 * Data program pelatihan untuk UI peserta.
 *
 * CATATAN: ini data statis sampai endpoint API program/pertemuan tersedia.
 * Semua halaman membaca lewat getProgram()/PROGRAMS, sehingga saat API siap cukup fungsi
 * di berkas ini yang diganti dengan fetchApi().
 *
 * Sumber tautan: Linktree klien (https://linktr.ee/Sopinsya_Konsultasi_SMAP).
 * - Pre-test dan Post-test dikerjakan langsung di website (TestDialog). Soal, kunci jawaban, dan
 *   hasil dikelola API (/api/public/programs/:slug/pertemuan/:n/tests/:type).
 * - Materi dan Studi Kasus berupa folder Google Drive (dibuka di tab baru; folder Drive tidak
 *   bisa ditanam dalam iframe).
 * - url bernilai null = belum diisi (UI menampilkan "Belum tersedia").
 */

export type Tone = "blue" | "teal" | "navy";

export interface Doc {
  title: string;
  url: string | null;
}

export interface VideoRef {
  id: number;
  title: string;
  url: string | null;
}

export interface Meeting {
  id: number;
  title: string;
  sop: Doc;
  silabus: Doc;
  materi: Doc;
  studiKasus: Doc;
  blooketUrl: string | null;
  videos: VideoRef[];
}

export interface Program {
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
  meetings: Meeting[];
}

/** Tautan resmi dari Linktree klien. */
const LINKS = {
  materi: "https://drive.google.com/drive/folders/1AmQvrqtKZ5GD_TvkCW9aId20lagPufvQ?usp=sharing",
  blooket: "https://play.blooket.com/play",
  studiKasus: "https://drive.google.com/drive/folders/1Ac4qtHwp29A3ULBYimJ8MGYmxrssGTFd?usp=sharing",
  video: "https://youtu.be/TxuysbLRnEk",
} as const;

function makeMeetings(code: string, fullTitle: string): Meeting[] {
  return [1, 2].map((n) => ({
    id: n,
    title: `Pertemuan ${n}`,
    sop: { title: `Pustaka SOP ${fullTitle}`, url: null },
    silabus: { title: `Silabus ${fullTitle}`, url: null },
    materi: { title: `Materi Pelatihan ${code}`, url: LINKS.materi },
    studiKasus: { title: `Studi Kasus ${code}`, url: LINKS.studiKasus },
    blooketUrl: LINKS.blooket,
    videos: [{ id: 1, title: "Video 1", url: LINKS.video }],
  }));
}

export const PROGRAMS: Program[] = [
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
    meetings: makeMeetings("ISO 9001", "ISO 9001: 2015"),
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
    meetings: makeMeetings("ISO 14001", "ISO 14001: 2015"),
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
    meetings: makeMeetings("ISO 45001", "ISO 45001: 2018"),
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
    meetings: makeMeetings("ISO 37001", "ISO 37001: 2025"),
  },
];

export function getProgram(slug: string): Program | undefined {
  return PROGRAMS.find((p) => p.slug === slug);
}

export function getMeeting(program: Program, id: number): Meeting | undefined {
  return program.meetings.find((m) => m.id === id);
}

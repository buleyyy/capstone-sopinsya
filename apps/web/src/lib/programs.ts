/**
 * Program pelatihan untuk UI peserta. Data berasal dari API publik (/api/public/programs) yang dikelola Admin
 * di database; TIDAK ada lagi data statis di sini. Bentuk tipe harus sejalan dengan
 * apps/api/src/domain/training.ts (PublicProgram).
 *
 * - Pre-test dan Post-test dikerjakan langsung di website (TestDialog) lewat
 *   /api/public/programs/:slug/pertemuan/:n/tests/:type; :n adalah Meeting.id (nomor pertemuan).
 * - url bernilai null = belum diisi (UI menampilkan "Belum tersedia").
 */
import { fetchApi, type ApiResult } from "./api";

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
  /** Nomor pertemuan (dipakai pada URL dan API tes). */
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

/** Daftar program terbit. Dipanggil dari Server Component. */
export function fetchPrograms(): Promise<ApiResult<Program[]>> {
  return fetchApi<Program[]>("/api/public/programs");
}

/** Satu program terbit; { status: "not_found" } bila slug tidak ada atau program belum terbit. */
export function fetchProgram(slug: string): Promise<ApiResult<Program>> {
  return fetchApi<Program>(`/api/public/programs/${encodeURIComponent(slug)}`);
}

export function getMeeting(program: Program, id: number): Meeting | undefined {
  return program.meetings.find((m) => m.id === id);
}

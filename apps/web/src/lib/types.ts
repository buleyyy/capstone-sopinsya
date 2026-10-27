/** Bentuk data dari API publik (/api/public/*). Harus sejalan dengan apps/api/src/domain/publicContent.ts. */
export interface Room {
  id: number;
  name: string;
  description: string | null;
  documentCount: number;
}

export interface RoomDocument {
  id: number;
  code: string;
  title: string;
  url: string | null;
}

export interface TrainingResource {
  id: number;
  type: "VIDEO" | "BLOOKET" | "CASE_STUDY" | "SYLLABUS";
  title: string;
  description: string | null;
  url: string;
}

export interface RoomDetail extends Room {
  documents: RoomDocument[];
  resources: TrainingResource[];
}

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

export interface RoomDetail extends Room {
  documents: RoomDocument[];
}

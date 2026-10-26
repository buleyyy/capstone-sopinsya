/**
 * Konten publik untuk peserta (tanpa login): Programpelatihan dan dokumen materinya.
 * Kontrak ini sengaja SEMPIT: tidak membawa departemen, pemilik SOP, akun, atau data audit.
 */
export interface PublicRoom {
  id: number;
  name: string;
  description: string | null;
  documentCount: number;
}

export interface PublicDocument {
  id: number;
  code: string;
  title: string;
  /** Tautan dokumen mentah dari database; router hanya meneruskan URL https. */
  url: string | null;
}

export interface PublicRoomDetail extends PublicRoom {
  documents: PublicDocument[];
}

export interface PublicContentStore {
  /** Hanya Programberstatus dipublikasikan, berurutan sortOrder lalu id. */
  listRooms(): Promise<PublicRoom[]>;
  /** null bila Programtidak ada ATAU belum dipublikasikan. Hanya dokumen yang dipublikasikan. */
  getRoom(roomId: number): Promise<PublicRoomDetail | null>;
}

import type { PrismaClient } from "@prisma/client";
import type { PublicContentStore, PublicRoom, PublicRoomDetail } from "../domain/publicContent.js";

/**
 * Implementasi konten publik dengan Prisma. Filter isPublished diterapkan di SINI (bukan di UI)
 * agar Programatau dokumen internal tidak pernah keluar dari API publik.
 * STATUS: belum pernah dijalankan terhadap database.
 */
export class PrismaPublicContentStore implements PublicContentStore {
  constructor(private readonly getClient: () => Promise<PrismaClient>) {}

  async listRooms(): Promise<PublicRoom[]> {
    const db = await this.getClient();
    const rows = await db.materialCategory.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { sopDocuments: { where: { isPublished: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      documentCount: r._count.sopDocuments,
    }));
  }

  async getRoom(roomId: number): Promise<PublicRoomDetail | null> {
    const db = await this.getClient();
    const row = await db.materialCategory.findFirst({
      where: { id: roomId, isPublished: true },
      select: {
        id: true,
        name: true,
        description: true,
        sopDocuments: {
          where: { isPublished: true },
          orderBy: [{ code: "asc" }],
          select: { id: true, code: true, title: true, pdfUrl: true },
        },
        trainingResources: {
          where: { isPublished: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, type: true, title: true, description: true, url: true },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      documentCount: row.sopDocuments.length,
      documents: row.sopDocuments.map((d) => ({ id: d.id, code: d.code, title: d.title, url: d.pdfUrl })),
      resources: row.trainingResources.map((r) => ({ id: r.id, type: r.type, title: r.title, description: r.description, url: r.url })),
    };
  }
}

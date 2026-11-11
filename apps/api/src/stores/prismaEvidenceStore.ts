import type { PrismaClient } from "@prisma/client";
import type { EvidenceFileRecord, EvidenceStore } from "../domain/evidenceFile.js";

/** Berkas bukti di tabel AuditEvidenceFile (LONGBLOB). Pembacaan selalu difilter dengan sessionId. */
export class PrismaEvidenceStore implements EvidenceStore {
  constructor(private readonly db: PrismaClient) {}

  async save(data: { sessionId: number; fileName: string; contentType: string; data: Buffer }): Promise<{ id: number }> {
    const row = await this.db.auditEvidenceFile.create({
      data: {
        sessionId: data.sessionId,
        fileName: data.fileName,
        contentType: data.contentType,
        sizeBytes: data.data.length,
        data: new Uint8Array(data.data), // Prisma Bytes meminta Uint8Array<ArrayBuffer>; Buffer bertipe ArrayBufferLike
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async get(sessionId: number, id: number): Promise<EvidenceFileRecord | null> {
    const r = await this.db.auditEvidenceFile.findFirst({ where: { id, sessionId } });
    if (!r) return null;
    return { id: r.id, sessionId: r.sessionId, fileName: r.fileName, contentType: r.contentType, data: Buffer.from(r.data) };
  }
}

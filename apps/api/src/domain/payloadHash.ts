import { sha256Hex } from "../lib/tokens.js";
import type { FindingClass } from "./auditSchemas.js";

export interface FindingPayload {
  answerId: number | null;
  classification: FindingClass;
  problem: string;
  location: string;
  objectiveEvidence: string;
  reference: string;
  note: string | null;
  evidenceUrl: string | null;
}

/**
 * Hash isi temuan yang sudah divalidasi dan dinormalisasi (zod: trim, kosong -> null).
 * Urutan field tetap (array), sehingga hasil deterministik. clientRequestId TIDAK ikut di-hash.
 */
export function findingPayloadHash(p: FindingPayload): string {
  return sha256Hex(
    JSON.stringify([
      p.answerId,
      p.classification,
      p.problem,
      p.location,
      p.objectiveEvidence,
      p.reference,
      p.note,
      p.evidenceUrl,
    ]),
  );
}

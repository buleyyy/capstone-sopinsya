import { describe, expect, it } from "vitest";
import { documentHeaderSchema, followUpSchema } from "../src/domain/auditSchemas.js";

describe("followUpSchema: field register temuan", () => {
  it("menerima tanggal YYYY-MM-DD, mengosongkan string kosong, dan merapikan nama", () => {
    const r = followUpSchema.parse({ reportedDate: "2026-11-05", verifiedDate: "", auditeeName: " Astari " });
    expect(r.reportedDate).toBe("2026-11-05");
    expect(r.verifiedDate).toBeNull();
    expect(r.auditeeName).toBe("Astari");
  });

  it("menolak tanggal yang formatnya salah atau tidak ada di kalender", () => {
    expect(followUpSchema.safeParse({ reportedDate: "05/11/2026" }).success).toBe(false);
    expect(followUpSchema.safeParse({ followedUpDate: "2026-13-45" }).success).toBe(false);
    expect(followUpSchema.safeParse({ verifiedDate: "2026-02-31" }).success).toBe(false);
  });

  it("tautan bukti tindakan wajib https tanpa kredensial", () => {
    expect(followUpSchema.safeParse({ correctionEvidenceUrl: "http://contoh.test/a" }).success).toBe(false);
    expect(followUpSchema.safeParse({ correctiveActionEvidenceUrl: "https://user:pw@contoh.test/a" }).success).toBe(false);
    expect(followUpSchema.parse({ correctionEvidenceUrl: "https://contoh.test/a" }).correctionEvidenceUrl).toBe(
      "https://contoh.test/a",
    );
  });

  it("semua field opsional: objek kosong menghasilkan null di setiap kolom", () => {
    const r = followUpSchema.parse({});
    expect(Object.values(r).every((v) => v === null)).toBe(true);
  });
});

describe("documentHeaderSchema", () => {
  const valid = {
    organization: "SOPINSYA EDUCENTER",
    subtitle: "Sistem Manajemen Anti Penyuapan (SMAP) ISO 37001",
    formTitle: "LAPORAN KETIDAKSESUAIAN DAN TINDAKAN KOREKTIF",
    formCode: "F.12-01",
    revision: "00",
    issuedAt: "",
  };

  it("menerima header lengkap dan tanggal terbit kosong", () => {
    expect(documentHeaderSchema.parse(valid)).toEqual(valid);
  });

  it("menolak nama organisasi atau nomor formulir yang kosong", () => {
    expect(documentHeaderSchema.safeParse({ ...valid, organization: "  " }).success).toBe(false);
    expect(documentHeaderSchema.safeParse({ ...valid, formCode: "" }).success).toBe(false);
  });
});

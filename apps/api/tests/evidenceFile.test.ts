import { describe, expect, it } from "vitest";
import { followUpSchema } from "../src/domain/auditSchemas.js";
import { MAX_EVIDENCE_BYTES, sanitizeFileName, validateEvidenceUpload } from "../src/domain/evidenceFile.js";

const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(32, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]);

/** Error yang dilempar fn (gagal bila tidak melempar). */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("Seharusnya melempar error");
}

describe("validateEvidenceUpload", () => {
  it("menerima PDF, gambar, dan Office dengan isi yang cocok dan menentukan tipe dari ekstensi", () => {
    expect(validateEvidenceUpload("SK Ruang.pdf", pdf)).toEqual({ fileName: "SK Ruang.pdf", contentType: "application/pdf", inline: true });
    expect(validateEvidenceUpload("foto.PNG", png).contentType).toBe("image/png");
    expect(validateEvidenceUpload("foto.jpeg", jpg).contentType).toBe("image/jpeg");
    expect(validateEvidenceUpload("rencana.xlsx", zip)).toMatchObject({ inline: false });
  });

  it("menolak ekstensi yang tidak diizinkan (mis. html, svg, exe)", () => {
    for (const name of ["a.html", "a.svg", "a.exe", "tanpa-ekstensi"]) {
      expect(thrown(() => validateEvidenceUpload(name, pdf))).toMatchObject({ statusCode: 422, code: "EVIDENCE_TYPE" });
    }
  });

  it("menolak isi yang tidak sesuai ekstensi (HTML menyamar sebagai PDF)", () => {
    expect(thrown(() => validateEvidenceUpload("a.pdf", Buffer.from("<script>alert(1)</script>")))).toMatchObject({
      code: "EVIDENCE_CONTENT",
    });
  });

  it("menolak berkas kosong dan berkas di atas 5 MB (413)", () => {
    expect(thrown(() => validateEvidenceUpload("a.pdf", Buffer.alloc(0)))).toMatchObject({ code: "EVIDENCE_EMPTY" });
    expect(thrown(() => validateEvidenceUpload("a.pdf", Buffer.alloc(MAX_EVIDENCE_BYTES + 1, 1)))).toMatchObject({ statusCode: 413 });
  });
});

describe("sanitizeFileName", () => {
  it("membuang path dan karakter berbahaya", () => {
    expect(sanitizeFileName("..\\..\\etc/pass<wd>.pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName('a"b:c*d?.jpg')).toBe("abcd.jpg");
  });

  it("memangkas nama panjang dengan mempertahankan ekstensi", () => {
    const n = sanitizeFileName(`${"x".repeat(300)}.pdf`);
    expect(n.length).toBeLessThanOrEqual(150);
    expect(n.endsWith(".pdf")).toBe(true);
  });
});

describe("tautan bukti berkas unggahan", () => {
  it("followUpSchema menerima tautan lokal /auditor/bukti/<id>/<nama>, tetap menolak path lain dan http", () => {
    expect(followUpSchema.parse({ correctionEvidenceUrl: "/auditor/bukti/12/foto%20satu.jpg" }).correctionEvidenceUrl).toBe(
      "/auditor/bukti/12/foto%20satu.jpg",
    );
    expect(followUpSchema.parse({ correctionEvidenceUrl: "/auditor/bukti/12" }).correctionEvidenceUrl).toBe("/auditor/bukti/12");
    for (const bad of ["/admin/akun", "/auditor/bukti/abc", "//evil.test/x", "http://contoh.test/a", "/auditor/bukti/1/../../x"]) {
      expect(followUpSchema.safeParse({ correctionEvidenceUrl: bad }).success).toBe(false);
    }
  });
});

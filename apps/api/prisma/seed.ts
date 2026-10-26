/**
 * Seed DATA CONTOH untuk DEVELOPMENT SAJA. Bukan data klien.
 * Aman diulang: hanya MEMBUAT yang belum ada (berdasarkan nama/kode), tidak pernah mengubah atau menghapus.
 *
 *   npm run db:seed -w @sopinsya/api
 *
 * Ditolak bila NODE_ENV=production atau DATABASE_URL kosong. Kredensial tidak pernah dicetak.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url = process.env["DATABASE_URL"];
if (process.env["NODE_ENV"] === "production") {
  console.error("[seed] Ditolak: NODE_ENV=production. Seed contoh hanya untuk development.");
  process.exit(1);
}
if (!url) {
  console.error("[seed] Ditolak: DATABASE_URL kosong.");
  process.exit(1);
}

const target = (() => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`; // tanpa user/password
  } catch {
    return "(URL tidak dapat dibaca)";
  }
})();

const rooms = [
  {
    name: "[CONTOH] Program1 - Pengenalan Sistem Manajemen",
    description: "Contoh Programpelatihan untuk pengujian tampilan. Ganti dengan materi resmi dari klien.",
    sortOrder: 1,
    isPublished: true,
    docs: [
      { code: "CONTOH-001", title: "Contoh Dokumen Pengantar", pdfUrl: "https://example.com/contoh-pengantar.pdf", isPublished: true },
      { code: "CONTOH-002", title: "Contoh Dokumen Tanpa Tautan", pdfUrl: null, isPublished: true },
      { code: "CONTOH-INTERNAL", title: "Contoh Dokumen Internal (tidak publik)", pdfUrl: "https://example.com/internal.pdf", isPublished: false },
    ],
  },
  {
    name: "[CONTOH] Program2 - Kebijakan dan Prosedur",
    description: null,
    sortOrder: 2,
    isPublished: true,
    docs: [],
  },
  {
    name: "[CONTOH] ProgramDraft (tidak publik)",
    description: "Programini belum dipublikasikan dan tidak boleh tampil bagi peserta.",
    sortOrder: 3,
    isPublished: false,
    docs: [{ code: "CONTOH-DRAFT", title: "Dokumen Programdraft", pdfUrl: "https://example.com/draft.pdf", isPublished: true }],
  },
];

const auditDepartments = ["IT", "HCGA", "Keuangan", "Procurement"];

// Pertanyaan umum bergaya ISO 37001 hanya untuk uji tampilan dan alur. Bukan instrumen audit resmi.
const sampleItems = [
  { reference: "Klausul 5.2", criteria: "Apakah kebijakan anti penyuapan tersedia dan dikomunikasikan kepada unit ini?" },
  { reference: "Klausul 7.5", criteria: "Apakah SOP unit ini tersedia, terkini, dan dapat ditunjukkan?" },
  { reference: "Klausul 8.2", criteria: "Apakah uji tuntas (due diligence) dilakukan dan buktinya tersimpan?" },
  { reference: "Klausul 9.1", criteria: "Apakah pemantauan dan pencatatan pelaksanaan SOP dilakukan secara rutin?" },
];

async function main() {
  const db = new PrismaClient({ datasourceUrl: url });
  console.log(`[seed] target database: ${target}`);
  let createdRooms = 0;
  let createdDocs = 0;
  try {
    for (const r of rooms) {
      let category = await db.materialCategory.findUnique({ where: { name: r.name } });
      if (!category) {
        category = await db.materialCategory.create({
          data: { name: r.name, description: r.description, sortOrder: r.sortOrder, isPublished: r.isPublished },
        });
        createdRooms += 1;
      }
      for (const d of r.docs) {
        const exists = await db.sopDocument.findUnique({ where: { code: d.code } });
        if (exists) continue;
        await db.sopDocument.create({ data: { ...d, categoryId: category.id } });
        createdDocs += 1;
      }
    }

    // ----- Contoh data audit (BUKAN checklist resmi klien; ganti lewat halaman Admin) -----
    const deptIds = new Map<string, number>();
    for (const name of auditDepartments) {
      const dept = (await db.department.findUnique({ where: { name } })) ?? (await db.department.create({ data: { name } }));
      deptIds.set(name, dept.id);
    }
    const standard =
      (await db.auditStandard.findUnique({ where: { code: "ISO37001" } })) ??
      (await db.auditStandard.create({ data: { code: "ISO37001", name: "Sistem Manajemen Anti Penyuapan (SMAP)" } }));
    const existingVersion = await db.checklistVersion.findUnique({
      where: { standardId_versionLabel: { standardId: standard.id, versionLabel: "CONTOH-1" } },
    });
    let createdItems = 0;
    if (!existingVersion) {
      const itemData = auditDepartments.flatMap((name) =>
        sampleItems.map((it, idx) => ({
          departmentId: deptIds.get(name) as number,
          criteria: `[CONTOH] ${it.criteria}`,
          reference: it.reference,
          sortOrder: (idx + 1) * 10,
        })),
      );
      await db.checklistVersion.create({
        data: {
          standardId: standard.id,
          versionLabel: "CONTOH-1",
          status: "PUBLISHED",
          publishedAt: new Date(),
          items: { create: itemData },
        },
      });
      createdItems = itemData.length;
    }
    console.log(`[seed] audit: ${auditDepartments.length} departemen, versi CONTOH-1 ${existingVersion ? "sudah ada" : `dibuat (${createdItems} poin)`}.`);
  } finally {
    await db.$disconnect();
  }
  console.log(`[seed] selesai: ${createdRooms} Programbaru, ${createdDocs} dokumen baru (yang sudah ada dibiarkan).`);
}

main().catch((err) => {
  console.error("[seed] gagal:", (err as Error).message);
  process.exit(1);
});

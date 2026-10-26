/**
 * Seed Pre/Post-test CONTOH untuk UAT. Aman dijalankan berulang: tes yang sudah ada tidak diubah.
 *
 * PENTING: isi soal di bawah hanyalah PLACEHOLDER agar alur bisa dicoba. Ganti dengan soal asli dari
 * trainer (Pak Ahmad Fadillah) sebelum UAT. Belum ada layar Admin untuk soal; sementara lewat berkas ini
 * atau Prisma Studio.
 *
 * Jalankan: npm run db:seed:tests -w @sopinsya/api
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LABELS = ["A", "B", "C", "D"] as const;
const QUESTION_COUNT = 10;

/** Program + pertemuan yang diberi soal contoh. slug harus sama dengan apps/web/src/lib/programs.ts. */
const TARGETS = [
  { slug: "iso-9001", fullTitle: "ISO 9001: 2015", meetings: [1, 2] },
  { slug: "iso-14001", fullTitle: "ISO 14001: 2015", meetings: [1, 2] },
  { slug: "iso-45001", fullTitle: "ISO 45001: 2018", meetings: [1, 2] },
  { slug: "iso-37001", fullTitle: "ISO 37001: 2025", meetings: [1, 2] },
];

async function main() {
  for (const target of TARGETS) {
    for (const meetingNo of target.meetings) {
      for (const type of ["PRE", "POST"] as const) {
        const exists = await prisma.test.findUnique({
          where: { programSlug_meetingNo_type: { programSlug: target.slug, meetingNo, type } },
          select: { id: true },
        });
        if (exists) {
          console.log(`[seed-tests] lewati ${target.slug} pertemuan ${meetingNo} ${type} (sudah ada)`);
          continue;
        }

        await prisma.test.create({
          data: {
            programSlug: target.slug,
            meetingNo,
            type,
            title: `${type === "PRE" ? "Pre-test" : "Post-test"} ${target.fullTitle}`,
            questions: {
              create: Array.from({ length: QUESTION_COUNT }, (_, i) => ({
                orderNo: i + 1,
                text: `[CONTOH] Soal ${i + 1}. Ganti dengan soal ${target.fullTitle} dari trainer.`,
                options: {
                  create: LABELS.map((label, oi) => ({
                    label,
                    text: `[CONTOH] Jawaban ${label}`,
                    // Kunci bergilir A, B, C, D agar penilaian mudah diperiksa saat uji coba.
                    isCorrect: oi === i % LABELS.length,
                  })),
                },
              })),
            },
          },
        });
        console.log(`[seed-tests] dibuat ${target.slug} pertemuan ${meetingNo} ${type}: ${QUESTION_COUNT} soal contoh`);
      }
    }
  }
}

main()
  .catch((err) => {
    console.error("[seed-tests] gagal:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Menyiapkan akun Admin dari environment.
 *
 * MODE BIASA (bawaan): membuat Admin PERTAMA. Idempotent: bila sudah ada Admin, tidak ada yang diubah.
 *   1) isi BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (min. 12 karakter), BOOTSTRAP_ADMIN_NAME di apps/api/.env
 *   2) npm run db:bootstrap-admin -w @sopinsya/api
 *   3) KOSONGKAN lagi BOOTSTRAP_ADMIN_PASSWORD di .env.
 *
 * MODE SELARAS (BOOTSTRAP_ADMIN_SYNC=true): memperbaiki akun Admin yang sudah ada, mis. yang masih memakai email
 *   placeholder atau kata sandinya tidak diketahui. Email, kata sandi, dan status aktif Admin disamakan dengan
 *   BOOTSTRAP_ADMIN_*. Tidak membuat duplikat, tidak menghapus data. Aman diulang (UNCHANGED bila sudah sama).
 *   Bila ada lebih dari satu Admin dan tidak satu pun memakai BOOTSTRAP_ADMIN_EMAIL, tidak ada yang diubah.
 *
 * Kata sandi disimpan sebagai hash bcrypt dan tidak pernah dicetak.
 */
import { loadEnv } from "../src/config/env.js";
import { PrismaClient } from "@prisma/client";
import { bootstrapAdmin, syncBootstrapAdmin } from "../src/services/accountService.js";
import { PrismaAccountStore } from "../src/stores/prismaAccountStore.js";

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL belum diatur.");
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error("Atur BOOTSTRAP_ADMIN_EMAIL dan BOOTSTRAP_ADMIN_PASSWORD (minimal 12 karakter) di apps/api/.env.");
  }
  const prisma = new PrismaClient();
  try {
    const store = new PrismaAccountStore(prisma);

    if (env.BOOTSTRAP_ADMIN_SYNC) {
      const result = await syncBootstrapAdmin(store, {
        email: env.BOOTSTRAP_ADMIN_EMAIL,
        password: env.BOOTSTRAP_ADMIN_PASSWORD,
        name: env.BOOTSTRAP_ADMIN_NAME, // kosong = nama akun yang ada tidak diubah
      });
      switch (result.status) {
        case "CREATED":
        case "UPDATED":
          console.log(`Akun Admin ${result.status === "CREATED" ? "dibuat" : "diselaraskan"}: ${result.account.email} (${result.changes.join("; ")}).`);
          console.log("Selesai. Kosongkan BOOTSTRAP_ADMIN_PASSWORD dan set BOOTSTRAP_ADMIN_SYNC=false di .env sekarang.");
          break;
        case "UNCHANGED":
          console.log(`Tidak ada perubahan: akun Admin ${result.account.email} sudah sesuai.`);
          break;
        case "EMAIL_TAKEN":
          console.log("Dilewati: email tersebut dipakai akun non-Admin. Tidak ada yang diubah.");
          break;
        case "AMBIGUOUS":
          console.log("Dilewati: ada lebih dari satu akun Admin dan tidak ada yang memakai email tersebut. Tidak ada yang diubah.");
          break;
      }
      return;
    }

    const result = await bootstrapAdmin(store, {
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      password: env.BOOTSTRAP_ADMIN_PASSWORD,
      name: env.BOOTSTRAP_ADMIN_NAME ?? "Administrator",
    });
    if (result.created) {
      console.log(`Akun Admin dibuat: ${result.account.email}. Kosongkan BOOTSTRAP_ADMIN_PASSWORD dari .env sekarang.`);
    } else if (result.reason === "ADMIN_EXISTS") {
      console.log("Dilewati: sudah ada akun Admin. Tidak ada yang diubah.");
      console.log("Untuk menyelaraskan Admin yang ada dengan BOOTSTRAP_ADMIN_*, set BOOTSTRAP_ADMIN_SYNC=true lalu jalankan ulang.");
    } else {
      console.log("Dilewati: email tersebut sudah dipakai akun lain. Tidak ada yang diubah.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

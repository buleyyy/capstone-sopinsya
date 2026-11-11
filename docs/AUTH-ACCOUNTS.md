# Autentikasi akun, penugasan sesi, dan rencana penghapusan fallback

Dokumen ini menjelaskan hasil Fase 2 dan jadwal pembersihan komponen sementara.

## Model yang berlaku

- **Sumber utama**: tabel `UserAccount` (email, `passwordHash` bcrypt, `role` ADMIN/AUDITOR, `isActive`).
- **Login**: `POST /masuk` memeriksa akun database. Role akun menentukan tujuan (`/admin` atau `/auditor`).
  Akun nonaktif, kata sandi salah, dan email tidak dikenal menghasilkan pesan yang sama. Pembatasan percobaan per IP tetap berlaku.
- **Cookie**: cookie bertanda tangan membawa id akun. Keaktifan dan role akun dibaca ulang dari database pada
  **setiap request**, jadi menonaktifkan akun langsung memutus akses.
- **Admin pertama**: dibuat sekali lewat `npm run db:bootstrap-admin -w @sopinsya/api` dari `BOOTSTRAP_ADMIN_*`
  di `.env` (tidak ada kata sandi di kode). Setelah itu kosongkan `BOOTSTRAP_ADMIN_PASSWORD`.
- **Akun Auditor**: dibuat, diubah, dinonaktifkan, dan di-reset Admin lewat **Kelola Akun** (`/admin/akun`).
  Kata sandi sementara ditampilkan satu kali.
- **Penugasan sesi**: Admin menugaskan akun Auditor ke sesi (`Auditor.userId`). Auditor hanya melihat sesi yang
  ditugaskan kepadanya (sesi ACTIVE terbaru, atau CLOSED terbaru selama jendela akses).
- **Tanpa Master Checklist**: `AuditSession.checklistVersionId` kini opsional. Checklist menjadi arsip; alur
  inti adalah Register Temuan.
- **Tanpa undangan/token**: UI, rute (`/admin/sesi/:id/auditor/:auditorId/terbit-ulang`, `/undangan/:token`),
  dan otorisasi undangan sudah dihapus dari alur aktif.

## Data historis (tidak dihapus)

- Kolom `Auditor.inviteHash`, `inviteExpiresAt`, `claimedAt`, `tokenHash` tetap ada. Untuk penugasan akun, kolom
  wajib itu diisi nilai tak terpakai (hash acak, kedaluwarsa, ditandai diklaim).
- Auditor lama hasil undangan (`userId` NULL) tetap tampil di detail sesi sebagai "Undangan lama".
- Tabel `ChecklistVersion`, `ChecklistItem`, `AuditAnswer`, dan sesi lama yang memakai versi checklist tidak berubah.

## Fallback sementara: kata sandi environment

- Aktif hanya bila `LEGACY_ENV_LOGIN=true`. **Bawaan false.** Aplikasi menolak start di production bila true.
- Mencakup: `ADMIN_PASSWORD`, `AUDITOR_PASSWORD`, `ADMIN_LOGIN_EMAIL`, `AUDITOR_LOGIN_EMAIL`, cookie lama, dan
  `resolvePasswordLogin` / `findPasswordLoginAuditor`.

### Rencana penghapusan

1. **Sekarang**: biarkan `LEGACY_ENV_LOGIN=false`. Aktifkan hanya bila perlu masuk selagi akun belum dibuat.
2. **Setelah Admin pertama dan semua akun Auditor aktif dipakai tim** (target: akhir UAT): hapus
   `ADMIN_PASSWORD`, `AUDITOR_PASSWORD`, dan `LEGACY_ENV_LOGIN` dari `.env` semua lingkungan.
3. **Pembersihan kode (rilis berikutnya)**, dalam satu perubahan terpisah:
   - hapus `LEGACY_ENV_LOGIN`, `ADMIN_PASSWORD`, `AUDITOR_PASSWORD`, `*_LOGIN_EMAIL` dari `env.ts`;
   - hapus cabang fallback di `loginRoutes.ts`, `checkAdminPassword`/`checkAuditorPassword` dan cookie lama
     (3 bagian / id angka) di `security.ts`;
   - hapus `resolvePasswordLogin`, `findPasswordLoginAuditor`, `UNBOUND_AUDITOR_ID` bila tidak lagi dipakai;
   - hapus fungsi undangan (`createAuditor`, `reissueInvitation`, `claimInvitation`, `authenticate`) beserta test-nya.
4. **Migrasi pembersihan terpisah (opsional, destruktif, butuh persetujuan)**: setelah data historis diarsipkan,
   pertimbangkan menghapus kolom undangan di `Auditor`. Jangan dijalankan tanpa cadangan.

# Runbook Sopinsya — UAT 28–29 Oktober 2026

Runbook ini mengikuti flow yang tersedia pada branch ini. Lakukan UAT dengan data contoh lebih dahulu; jangan gunakan dokumen internal klien di environment publik.

## 1. Komponen aplikasi

| Area | Lokasi | URL lokal | Pengguna |
|---|---|---|---|
| Web peserta | `apps/web` (Next.js) | `http://localhost:3000` | Peserta pelatihan, tanpa login |
| Web staf | `apps/api` (Express + EJS) | `http://localhost:4000` | Admin dan Auditor |
| Health API | Express | `http://localhost:4000/api/health` | Probe/debug |
| Health database | Express | `http://localhost:4000/api/health/db` | Probe/debug |

Admin masuk dari `/masuk` dengan email Admin dan `ADMIN_PASSWORD`. Auditor **tidak** menggunakan kata sandi bersama: akses diberikan lewat token undangan individual yang diterbitkan Admin dari halaman detail sesi.

## 2. Setup pertama kali (Windows PowerShell)

Dari root repository:

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Isi `apps/api/.env` sekurang-kurangnya dengan:
- `DATABASE_URL` yang mengarah ke database MySQL lokal `sopinsya`.
- `APP_ORIGIN=http://localhost:4000`.
- `CSRF_SECRET` acak dan minimal 32 karakter; buat dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `ADMIN_PASSWORD` untuk UAT lokal. Gunakan kata sandi unik; jangan pakai nilai contoh untuk environment yang dapat diakses orang lain.

Buat database bila belum ada:

```sql
CREATE DATABASE sopinsya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Generate Prisma Client, jalankan migrasi, lalu seed data contoh:

```powershell
npm run db:generate
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run db:seed -w @sopinsya/api
```

Perintah `migrate deploy` sesuai untuk menerapkan migrasi yang sudah ada. Bila sedang mengembangkan perubahan schema lokal, ikuti alur migrasi Prisma yang disepakati tim dan jangan menghapus database berisi data yang dibutuhkan.

Jalankan pemeriksaan statis dan tes:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Buka dua terminal dari root:
- Terminal 1: `npm run dev:api` → `http://localhost:4000`
- Terminal 2: `npm run dev:web` → `http://localhost:3000`

## 3. UAT dari perangkat lain melalui LAN

Jika Admin, Auditor, dan peserta membuka aplikasi dari perangkat berbeda, jangan gunakan `localhost` untuk alamat server. Ganti placeholder berikut dengan IP/LAN hostname komputer server, lalu restart kedua aplikasi setelah mengubah environment:

- `apps/api/.env`: `APP_ORIGIN=http://192.168.1.20:4000`
- `apps/api/.env`: `CORS_ORIGINS=http://192.168.1.20:3000` (origin browser portal peserta; pisahkan dengan koma bila ada origin tambahan)
- `apps/web/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://192.168.1.20:4000`

Alamat IP tersebut hanya contoh. Pastikan firewall mengizinkan port UAT dan auditor dapat membuka URL staff yang diberikan. `APP_ORIGIN` harus mengarah ke host staff yang akan menyusun tautan undangan. Untuk deployment publik gunakan HTTPS dan origin produksi, bukan HTTP atau nilai contoh.

## 4. Flow Admin — persiapan sesi audit

1. Masuk sebagai Admin di `http://localhost:4000/masuk`.
2. Buka **Departemen** dan tambahkan semua unit yang akan diaudit.
3. Buka **Master Checklist**. Buat standar, buat versi checklist, lalu isi poin menggunakan format `Rujukan | Pertanyaan`. Pastikan tiap unit yang ditugaskan memiliki poin checklist. Terbitkan versi; versi terbit tidak dapat diedit.
4. Buka **Sesi Audit**, buat sesi dari versi terbit dan tentukan batas tulis dalam waktu lokal/WIB.
5. Pada detail sesi, tambahkan setiap auditor secara terpisah. Tentukan unit yang tidak boleh diaudit auditor tersebut untuk mencegah self-audit.
6. Buat penugasan untuk auditor dan unitnya. Sistem menolak penugasan ke unit yang dikecualikan.
7. Aktifkan sesi. Sistem harus menolak aktivasi bila belum ada auditor yang belum dicabut atau belum ada penugasan aktif yang memiliki poin checklist.
8. Setelah sesi aktif, salin dan kirim tautan undangan individual yang ditampilkan. Tautan rahasia itu hanya ditampilkan saat diterbitkan/diperbarui dan tidak boleh dimasukkan ke issue, chat publik, atau tangkapan layar.

Dashboard Admin memandu langkah setup dan memberi tautan langsung ke bagian status sesi, auditor, dan penugasan.

## 5. Flow Auditor — mengerjakan audit

1. Buka tautan undangan personal dari Admin.
2. Periksa informasi halaman aktivasi, lalu tekan **Terima undangan dan masuk**. Sekadar membuka halaman tidak menghabiskan undangan; token baru diklaim saat formulir dikirim.
3. Auditor diarahkan ke Dashboard Audit. Pastikan unit pada dashboard sesuai dengan penugasan auditor.
4. Buka Checklist untuk tiap unit, isi **YA/TIDAK**, catatan, dan URL bukti HTTPS bila diperlukan; simpan jawaban.
5. Untuk jawaban **TIDAK**, catat temuan dengan klasifikasi **Major, Minor, atau Observasi**. Lengkapi tindak lanjut yang relevan dan tutup temuan setelah verifikasi.
6. Buka laporan unit dan cetak untuk pemeriksaan output.
7. Pustaka SOP hanya menampilkan program dan dokumen yang dipublikasikan.
8. Saat logout, token sesi di database dibatalkan. Untuk masuk kembali, minta Admin menerbitkan ulang undangan.

## 6. Checklist UAT

| No. | Skenario | Hasil yang diharapkan |
|---:|---|---|
| 1 | Buka `/admin` tanpa sesi Admin | Dialihkan ke `/masuk` |
| 2 | Masuk dengan kata sandi Admin yang benar | Dashboard Admin terbuka |
| 3 | Masuk dengan kredensial salah | Pesan error umum; percobaan dibatasi |
| 4 | Terbitkan checklist kosong | Ditolak |
| 5 | Buat sesi dari checklist yang belum terbit | Ditolak |
| 6 | Aktifkan sesi tanpa auditor | Ditolak dengan instruksi yang dapat ditindaklanjuti |
| 7 | Aktifkan sesi tanpa penugasan valid atau tanpa poin checklist untuk unit yang ditugaskan | Ditolak |
| 8 | Penugasan ke unit pengecualian auditor | Ditolak (self-audit) |
| 9 | Buka halaman undangan via GET | Halaman aktivasi tampil; token belum diklaim |
| 10 | Klaim undangan yang masih valid satu kali | Cookie sesi terbit dan Dashboard Auditor terbuka |
| 11 | Klaim token yang sama lagi | Ditolak |
| 12 | Auditor mencoba membuka penugasan auditor lain | Data tidak boleh terungkap/diakses |
| 13 | POST checklist tanpa token CSRF valid | Ditolak |
| 14 | Isi checklist dan simpan bukti HTTPS | Jawaban tersimpan; kemajuan dashboard berubah |
| 15 | Catat Major/Minor/Observasi lalu isi tindak lanjut | Temuan dan tindak lanjut terlihat konsisten di register/laporan |
| 16 | Logout lalu buka dashboard dengan cookie lama | Akses ditolak; minta undangan baru |
| 17 | Undangan kedaluwarsa/dicabut atau sesi tidak dapat diakses | Klaim tidak berhasil |
| 18 | Sesi melewati batas tulis | Data tidak lagi bisa diubah |
| 19 | Buka program/materi publik saat API mati | Pengguna mendapat empty/error state yang jelas, bukan halaman crash |
| 20 | Cek tampilan pada lebar desktop dan mobile | Navigasi, tombol, form, tabel, dan feedback tetap dapat digunakan |

Rekam hasil aktual, browser/perangkat, akun uji, dan bukti untuk setiap kasus. Jangan menyatakan UAT lulus hanya karena halaman dapat dibuka.

## 7. Batasan dan pemulihan

- Undangan mulai menghitung masa berlaku sejak auditor dibuat (default 7 hari). Jika setup sesi lama tertunda hingga undangan kedaluwarsa, Admin perlu menerbitkan ulang.
- Tautan undangan adalah rahasia sekali pakai. Bagikan hanya kepada auditor yang dituju dan melalui kanal yang disetujui.
- URL PDF/bukti adalah referensi eksternal; akses dokumennya tetap ditentukan penyedia URL. Jangan memakai tautan publik untuk dokumen rahasia.
- Web peserta menyimpan pilihan “Ikuti Pelatihan” di browser saat ini; status pendaftaran belum menjadi enrollment persisten di server. Hasil tes peserta disimpan oleh API, tetapi alur registrasi/akun peserta bukan bagian dari gerbang Admin/Auditor.
- Web staf saat ini memiliki peran Admin dan Auditor. Jangan mengasumsikan peran Trainer yang terpisah sebelum hak aksesnya disetujui.
- Detail keputusan bisnis yang belum final dicatat di `docs/PENDING-DECISIONS.md`.
- Siapkan form checklist/temuan cetak dan PDF SOP cadangan untuk UAT. Database demo dan seed bukan data resmi klien.

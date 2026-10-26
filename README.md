# Sopinsya

**Platform pelatihan dan audit internal SMAP berbasis web**  
Capstone Project · Kelompok 1 · Kelas 4KA23

Sopinsya memiliki dua area aplikasi yang dipakai untuk kebutuhan berbeda: portal pelatihan publik untuk peserta dan portal staf untuk pelaksanaan audit internal ISO 37001 / Sistem Manajemen Anti-Penyuapan (SMAP).

## Area aplikasi

| Area | Teknologi | Pengguna | Tanggung jawab |
|---|---|---|---|
| Portal peserta (`apps/web`) | Next.js App Router, React, TypeScript | Peserta pelatihan | Katalog program, materi/video referensi, studi kasus, pre-test dan post-test |
| Portal staf (`apps/api`) | Express, TypeScript, EJS | Admin dan Auditor | Data master, versi checklist, sesi audit, penugasan, checklist, temuan, tindak lanjut, laporan dan Pustaka SOP |
| Data | MySQL 8, Prisma | Backend | Penyimpanan sesi, auditor, checklist, jawaban, temuan dan konten publik |
| Pengujian API | Vitest, Supertest | Developer | Pengujian service, route, dan aturan keamanan |

**Pemisahan akses:** peserta tidak memerlukan login. Admin masuk ke `/masuk` memakai `ADMIN_PASSWORD`. Auditor menggunakan undangan individual sekali pakai; setiap token sesi diverifikasi pada request dan dibatalkan saat logout.

## Struktur repository

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/           # schema, migrations, seed
│   │   ├── src/domain/       # aturan, tipe, validasi
│   │   ├── src/services/     # use case / business logic
│   │   ├── src/stores/       # implementasi Prisma untuk data audit
│   │   ├── src/routes/       # health, konten publik, tes peserta
│   │   ├── src/web/          # rute server-rendered Admin/Auditor
│   │   ├── views/            # template EJS
│   │   ├── public/app.css    # design tokens dan layout portal staf
│   │   └── tests/            # Vitest + Supertest
│   └── web/
│       └── src/
│           ├── app/          # halaman publik Next.js
│           ├── components/   # komponen UI peserta
│           └── lib/          # API client dan data program
├── docs/
│   ├── PENDING-DECISIONS.md  # keputusan yang menunggu konfirmasi
│   ├── RUNBOOK-UAT.md        # setup, flow dan checklist UAT
│   └── FLOW-AND-UX-REVIEW.md # artefak review alur dan UX
├── package.json
└── README.md
```

## Memulai secara lokal

### Persyaratan

- Node.js versi 20 atau lebih baru.
- npm versi 10 atau lebih baru.
- MySQL 8 untuk fitur yang memerlukan persistensi.
- Git.

### 1. Instal dependency dan environment

Dari root repository:

```powershell
git clone https://github.com/buleyyy/capstone-sopinsya.git
cd capstone-sopinsya
npm install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Isi `DATABASE_URL` di `apps/api/.env`, misalnya:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/sopinsya"
APP_ORIGIN=http://localhost:4000
CSRF_SECRET=<secret-acak-minimal-32-karakter>
ADMIN_PASSWORD=<kata-sandi-lokal-anda>
```

Buat database bila belum tersedia:

```sql
CREATE DATABASE sopinsya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Jangan gunakan kata sandi contoh untuk server yang dapat diakses jaringan. Jangan commit `.env`, `.env.local`, kata sandi, secret, atau tautan undangan.

### 2. Terapkan schema dan seed data contoh

```powershell
npm run db:generate
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run db:seed
```

Seed berisi data **contoh** untuk development, bukan data resmi klien. Jangan menjalankan seed tanpa memeriksa efeknya pada database yang digunakan.

### 3. Jalankan aplikasi

Dalam dua terminal dari root repository:

```powershell
# Terminal 1 — API + portal staf
npm run dev:api

# Terminal 2 — portal peserta
npm run dev:web
```

| Service | URL lokal |
|---|---|
| Portal peserta | [http://localhost:3000](http://localhost:3000) |
| Gerbang Admin | [http://localhost:4000/masuk](http://localhost:4000/masuk) |
| Health API | [http://localhost:4000/api/health](http://localhost:4000/api/health) |
| Health database | [http://localhost:4000/api/health/db](http://localhost:4000/api/health/db) |

`/api/health` memeriksa status API. `/api/health/db` memeriksa koneksi MySQL dan akan mengembalikan error terstruktur bila database belum dikonfigurasi atau tidak tersedia.

Untuk menjalankan keduanya sekaligus gunakan `npm run dev`.

## Perintah pengembangan

Jalankan dari root:

| Perintah | Tujuan |
|---|---|
| `npm run dev` | Menjalankan API dan web secara bersamaan |
| `npm run dev:api` | Menjalankan Express API dan web staf |
| `npm run dev:web` | Menjalankan Next.js |
| `npm run typecheck` | Type-check API dan web |
| `npm run lint` | ESLint pada web |
| `npm test` | Tes API |
| `npm run build` | Build API dan web |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Migrasi development dengan Prisma |

## Flow utama

### Admin

1. Buat departemen / unit yang diaudit.
2. Buat standar serta versi checklist, isi poin, lalu terbitkan versi.
3. Buat sesi dari checklist yang sudah terbit dan tentukan batas waktu.
4. Tambahkan auditor, tetapkan pengecualian self-audit, dan buat penugasan.
5. Aktifkan sesi setelah auditor dan penugasan valid tersedia.
6. Kirim tautan undangan personal setelah sesi aktif; pantau kemajuan dan temuan dari detail sesi.

### Auditor

1. Buka tautan individual dan tekan **Terima undangan dan masuk**.
2. Isi checklist untuk unit yang ditugaskan, simpan catatan dan bukti.
3. Catat temuan Major, Minor, atau Observasi.
4. Isi tindak lanjut dan tutup temuan setelah verifikasi.
5. Buka laporan unit untuk ditinjau atau dicetak.

Panduan lengkap serta skenario penerimaan tersedia di [Runbook UAT](docs/RUNBOOK-UAT.md). Artefak alur, temuan UX dan acceptance criteria tersedia di [Flow & UX Review](docs/FLOW-AND-UX-REVIEW.md).

## Batasan yang diketahui

- Pilihan “Ikuti Pelatihan” pada portal peserta saat ini disimpan di browser pengguna, belum menjadi registrasi/enrollment persisten di server.
- Materi PDF dan bukti audit direferensikan menggunakan URL HTTPS; izin akses tetap mengikuti penyedia dokumen.
- Portal staf saat ini memiliki peran Admin dan Auditor; peran Trainer terpisah belum ditetapkan.
- Beberapa keputusan aturan bisnis masih menunggu konfirmasi klien. Lihat [Keputusan Tertunda](docs/PENDING-DECISIONS.md); jangan menetapkan bobot tes, status tindak lanjut, atau hak akses baru tanpa persetujuan.
- Pemeriksaan typecheck, test, build dan UAT harus dijalankan pada environment developer/staging sebelum branch dianggap siap dipakai. Dokumentasi dan kode dalam repository bukan bukti bahwa pengujian browser maupun UAT telah lulus.

## Keamanan

- Gunakan secret CSRF acak berukuran minimal 32 karakter; wajib di production.
- Password production minimal 12 karakter sesuai validasi environment.
- Token undangan hanya dapat diklaim sekali. Jangan bagikan secara publik atau menyimpannya dalam dokumentasi.
- Dokumen internal tidak boleh menggunakan URL publik yang membuka akses di luar kontrol Sopinsya.
- Gunakan HTTPS dan tinjau konfigurasi origin, cookie serta reverse proxy sebelum deployment produksi.

---

Dikembangkan untuk **Capstone Project — Kelompok 1, 4KA23**.

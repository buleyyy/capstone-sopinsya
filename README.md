# Sopinsya

Aplikasi pelatihan berbasis web (Capstone Kelompok 1 / 4KA23). Monorepo npm workspaces:

| Path | Isi |
| --- | --- |
| `apps/api` | Express + TypeScript + Prisma (MySQL) |
| `apps/web` | Next.js (App Router) + TypeScript |

Status: **Fase 1 (fondasi)**. Belum ada autentikasi maupun fitur domain.

## Prasyarat

- Node.js >= 20 (diuji dengan Node 22 di sandbox; target lokal Node 24)
- npm >= 10
- MySQL 8 (opsional untuk Fase 1; wajib untuk fase berikutnya)

## Instalasi

```powershell
npm install
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local
```

`.env` dan `.env.local` sudah di-ignore Git. Jangan commit kredensial.

## Menjalankan

```powershell
npm run dev          # API (http://localhost:4000) + web (http://localhost:3000)
npm run dev:api      # hanya API
npm run dev:web      # hanya web
```

Cek API: `GET http://localhost:4000/api/health` (selalu 200 selama server hidup, status database ditampilkan eksplisit)
dan `GET http://localhost:4000/api/health/db` (200 jika MySQL terhubung, 503 jika belum dikonfigurasi/tidak terjangkau).

## Skrip

```powershell
npm run typecheck    # tsc untuk api dan web
npm run lint         # eslint (web)
npm test             # vitest + supertest (api)
npm run build        # build api (dist/) dan web (.next/)
```

## Database (MySQL + Prisma)

1. Buat database dan user lokal, contoh di MySQL shell:
   ```sql
   CREATE DATABASE sopinsya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'sopinsya_dev'@'localhost' IDENTIFIED BY 'GANTI_PASSWORD';
   GRANT ALL PRIVILEGES ON sopinsya.* TO 'sopinsya_dev'@'localhost';
   ```
2. Isi `DATABASE_URL` di `apps/api/.env`:
   `mysql://sopinsya_dev:GANTI_PASSWORD@localhost:3306/sopinsya`
3. Generate Prisma Client: `npm run db:generate`
4. Cek koneksi: jalankan API lalu buka `/api/health/db`.
5. Migrasi (`npm run db:migrate`) baru dipakai setelah model ditambahkan di `apps/api/prisma/schema.prisma` (Fase 2 dst.).
   Schema saat ini sengaja tanpa model.

## Konfigurasi environment

| Variabel | Lokasi | Keterangan |
| --- | --- | --- |
| `NODE_ENV` | api | `development` / `test` / `production` |
| `PORT` | api | default `4000` |
| `CORS_ORIGINS` | api | daftar origin dipisah koma, default `http://localhost:3000` |
| `DATABASE_URL` | api | `mysql://...`; kosong = API jalan tanpa database |
| `NEXT_PUBLIC_API_BASE_URL` | web | default `http://localhost:4000`; dipakai lewat `src/lib/config.ts` |

## Struktur API

```
apps/api/src
  app.ts            # createApp({ env, db }) - tanpa listen, mudah diuji
  server.ts         # entry point + graceful shutdown
  config/env.ts     # validasi env (zod)
  lib/database.ts   # abstraksi DB, Prisma dimuat lazy
  middleware/       # error handler terpusat
  routes/health.ts
  utils/            # format respons & AppError
```

Format respons: sukses `{ "success": true, "data": ... }`, gagal `{ "success": false, "error": { "code", "message" } }`.

## Roadmap

- Fase 2: Auth & RBAC (admin, trainer, peserta)
- Fase 3: Domain inti (pelatihan, jadwal, registrasi, materi, masa akses)
- Fase 4: Evaluasi & laporan

Keputusan bisnis yang belum final dicatat di `docs/PENDING-DECISIONS.md`.

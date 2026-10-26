# Runbook Sopinsya (UAT 28-29 Okt 2026)

## Dua aplikasi web

| Aplikasi | Lokasi | Port bawaan | Pengguna | Login |
|---|---|---|---|---|
| **Web peserta** (publik) | `apps/web` (Next.js) | 3000 | Peserta pelatihan | Tidak ada |
| **Web staf** (Admin + Auditor) | `apps/api` (Express + EJS, juga melayani `/api`) | 4000 | Admin, Auditor | Gerbang bersama `/masuk` |

Web peserta tidak memuat tautan ke web staf; Admin dan Auditor membuka alamat web staf secara langsung
(mis. `http://<IP-server>:4000/masuk`).

## Gerbang masuk bersama (`/masuk`)

Satu halaman untuk Admin dan Auditor. Email hanya memilih peran; kredensialnya berbeda:

| Peran | Email (bawaan, dapat diubah di `.env`) | Kredensial | Setelah masuk |
|---|---|---|---|
| Admin | `admin@sopinsya` | `ADMIN_PASSWORD` | `/admin` |
| Auditor | `auditor@sopinsya` | Kode undangan sekali pakai dari Admin | `/auditor` |

Tautan undangan `/undangan/<kode>` membuka gerbang dengan email dan kode terisi. Membuka tautan tidak menghanguskan
undangan; undangan baru terpakai saat tombol Masuk ditekan.

## Menjalankan (pertama kali)

```powershell
cd D:\capstone_project\capstone-sopinsya
npm install
copy apps\api\.env.example apps\api\.env      # lalu isi DATABASE_URL, CSRF_SECRET, ADMIN_PASSWORD
npm run prisma:generate -w @sopinsya/api
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma   # DB dev yang masih kosong
npm run db:seed -w @sopinsya/api              # data CONTOH (bukan data klien)
npm run typecheck
npm test -w @sopinsya/api
npm run dev -w @sopinsya/api                  # web staf + API  -> http://localhost:4000
npm run dev -w @sopinsya/web                  # web peserta     -> http://localhost:3000
```

## Alur UAT

1. Admin masuk, buat sesi (versi checklist terbit), undang auditor (isi unit terlarang), buat penugasan, aktifkan sesi.
2. Kirim tautan undangan ke tiap auditor. Auditor membuka tautan, menekan Masuk, mengisi Checklist, mencatat Temuan.
3. Admin memantau Register Temuan sesi di halaman sesi. Auditor memantau Dashboard Audit.

## Catatan penting

- Auditor yang menekan "Keluar" menghanguskan aksesnya; Admin harus menerbitkan ulang undangan.
- Seed hanya berisi CONTOH. Checklist resmi diisi Admin lewat halaman Checklist (format baris `Rujukan | Pertanyaan`).
- Backup plan hari-H: siapkan checklist dan form temuan cetak serta SOP PDF cadangan (tugas Trainer pada notulensi).
- Halaman tidak memakai JavaScript maupun CDN, sehingga tetap berfungsi pada koneksi lambat.

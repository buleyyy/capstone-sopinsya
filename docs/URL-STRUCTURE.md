# Struktur URL Sopinsya

Dokumen ini menjadi acuan bersama untuk penyesuaian navigasi dan routing Sopinsya. Path di bawah dibedakan menjadi **route yang sudah ada** dan **target yang diusulkan** agar implementasi tidak menganggap route yang belum dibuat sebagai fitur aktif.

## 1. Lokasi repository dan pembagian aplikasi

Repository: `buleyyy/capstone-sopinsya`

Root project lokal yang digunakan tim:

```text
D:\\capstone_project\\capstone-sopinsya
```

Mapping folder lokal ke path GitHub:

| Lokal | GitHub |
|---|---|
| `D:\\capstone_project\\capstone-sopinsya\\apps\\web` | `apps/web/` |
| `D:\\capstone_project\\capstone-sopinsya\\apps\\api` | `apps/api/` |
| `D:\\capstone_project\\capstone-sopinsya\\docs` | `docs/` |

Pemilik route:
- **Next.js (`apps/web`)**: halaman publik/peserta.
- **Express/EJS (`apps/api/src/web`)**: login, dashboard Admin, dan dashboard Auditor.
- **Express API (`apps/api/src/routes`)**: endpoint data dan proses aplikasi.

Dalam deployment satu domain, reverse proxy harus meneruskan route halaman publik ke Next.js dan route login/Admin/Auditor/API ke Express. Jangan menjalankan dua handler root (`/`) pada domain yang sama tanpa aturan proxy yang jelas.

## 2. Route yang sudah ada di repository

Daftar ini berdasarkan pemeriksaan file route di branch `main`. Route yang tidak tercantum di bagian ini belum boleh dianggap sudah tersedia.

### 2.1 Halaman publik — Next.js

| URL | Fungsi | Implementasi |
|---|---|---|
| `/` | Homepage/landing dan daftar program | `apps/web/src/app/page.tsx` |
| `/program` | Halaman daftar/browse program | `apps/web/src/app/program/page.tsx` |
| `/program/:slug` | Halaman detail program | `apps/web/src/app/program/[slug]/page.tsx` |
| `/tentang-kami` | Informasi tentang Sopinsya | `apps/web/src/app/tentang-kami/page.tsx` |

### 2.2 Login, Admin, dan Auditor — Express/EJS

| Method | URL | Fungsi |
|---|---|---|
| GET | `/masuk` | Halaman login bersama Admin/Auditor |
| POST | `/masuk` | Proses login dan pengalihan sesuai role |
| GET | `/admin/masuk` | Redirect ke `/masuk` |
| GET | `/undangan/:token` | Saat ini redirect ke `/masuk` |
| GET | `/admin` | Dashboard Admin |
| GET/POST | `/admin/departemen` | Daftar dan pengelolaan departemen |
| GET | `/admin/checklist` | Daftar master checklist |
| GET | `/admin/checklist/:id` | Detail versi checklist |
| POST | `/admin/checklist/standar` | Membuat standar checklist |
| POST | `/admin/checklist/versi` | Membuat versi checklist |
| POST | `/admin/checklist/:id/item` | Menambah item checklist |
| POST | `/admin/checklist/:id/terbit` | Menerbitkan versi checklist |
| GET/POST | `/admin/sesi` | Daftar dan pembuatan sesi audit |
| GET | `/admin/sesi/:id` | Detail sesi audit |
| POST | `/admin/sesi/:id/aktifkan` | Mengaktifkan sesi |
| POST | `/admin/sesi/:id/perpanjang` | Memperpanjang sesi |
| POST | `/admin/sesi/:id/tutup` | Menutup sesi |
| POST | `/admin/sesi/:id/auditor` | Menambahkan auditor ke sesi |
| POST | `/admin/sesi/:id/auditor/:auditorId/terbit-ulang` | Menerbitkan ulang undangan auditor |
| POST | `/admin/sesi/:id/auditor/:auditorId/cabut` | Mencabut akses auditor |
| POST | `/admin/sesi/:id/penugasan` | Membuat penugasan audit |
| GET | `/admin/program-training` | Pengelolaan resource dan tes pelatihan |
| POST | `/admin/program-training/resource` | Membuat resource pelatihan |
| POST | `/admin/program-training/resource/:id` | Memperbarui resource |
| POST | `/admin/program-training/resource/:id/publikasi` | Mengubah status publikasi resource |
| POST | `/admin/program-training/test` | Membuat tes |
| POST | `/admin/program-training/test/:id/question` | Menambahkan pertanyaan tes |
| POST | `/admin/program-training/test/:id/status` | Mengubah status tes |
| POST | `/admin/program-training/question/:id/status` | Mengubah status pertanyaan |
| GET | `/admin/sop` | Pustaka SOP Admin |
| POST | `/admin/sop/Program` | Membuat kategori/program SOP |
| POST | `/admin/sop/dokumen` | Membuat dokumen SOP |
| POST | `/admin/sop/Program/:id/publikasi` | Mengubah publikasi kategori/program SOP |
| POST | `/admin/sop/dokumen/:id/publikasi` | Mengubah publikasi dokumen SOP |
| POST | `/admin/keluar` | Logout Admin |
| GET | `/auditor` | Dashboard Auditor |
| GET/POST | `/auditor/penugasan/:id` | Checklist penugasan audit |
| GET/POST | `/auditor/penugasan/:id/temuan` | Daftar dan pembuatan temuan pada penugasan |
| POST | `/auditor/temuan/:id/tindak-lanjut` | Menyimpan tindak lanjut temuan |
| POST | `/auditor/temuan/:id/tutup` | Menutup temuan |
| GET | `/auditor/penugasan/:id/laporan` | Laporan hasil audit |
| GET | `/auditor/sop` | Daftar Pustaka SOP Auditor |
| GET | `/auditor/sop/:id` | Detail dokumen SOP |
| POST | `/auditor/keluar` | Logout Auditor |

### 2.3 API yang sudah ada

| Method | URL | Fungsi |
|---|---|---|
| GET | `/api/health` | Health check API |
| GET | `/api/health/db` | Health check koneksi database |
| GET | `/api/public/rooms` | Daftar kamar/kategori materi publik |
| GET | `/api/public/rooms/:id` | Detail kamar/kategori materi |
| GET | `/api/public/programs/:slug/pertemuan/:n/tests/:type` | Mengambil pre-test/post-test berdasarkan program dan pertemuan |
| POST | `/api/public/tests/:testId/attempts` | Mengirim percobaan tes peserta |

## 3. Target struktur URL sesuai alur produk

Target ini mengikuti pembagian Peserta, Admin, dan Auditor serta keputusan UX terbaru. Ini adalah **acuan implementasi**, bukan pernyataan bahwa semua route sudah tersedia.

### 3.1 Peserta

| URL target | Fungsi | Catatan |
|---|---|---|
| `/` | Homepage sekaligus katalog program | Menjadi entry point publik |
| `/#program` | Scroll ke daftar program | Anchor pada homepage, bukan halaman baru |
| `/program/:slug` | Halaman pelatihan | Satu halaman panjang untuk seluruh konten program |
| `/program/:slug#silabus` | Bagian silabus | Anchor pada halaman pelatihan |
| `/program/:slug#materi` | Bagian materi | Materi PDF/PPT atau tautan yang disetujui |
| `/program/:slug#studi-kasus` | Bagian studi kasus | Termasuk akses/unggah tugas bila berlaku |
| `/program/:slug#pre-test` | Bagian pre-test | Tes peserta tanpa akun |
| `/program/:slug#post-test` | Bagian post-test | Tes peserta tanpa akun |
| `/program/:slug#video-referensi` | Bagian video referensi | Dapat memuat lebih dari satu video |
| `/program/:slug#pustaka-sop` | Bagian Pustaka SOP | Dokumen yang relevan untuk program |
| `/program/:slug#ulasan` | Bagian rating dan ulasan | Ulasan hanya dari peserta yang berhak |
| `/tentang-kami` | Informasi perusahaan/platform | Route saat ini tetap dipertahankan |
| `/#hubungi-kami` | Scroll ke bagian kontak | Gunakan anchor bila kontak menjadi bagian homepage; jangan membuat halaman terpisah tanpa kebutuhan |

**Prinsip penting:** Silabus, materi, studi kasus, pre-test, post-test, video referensi, Pustaka SOP, dan ulasan merupakan section dalam halaman pelatihan. Jangan membuat route terpisah seperti `/materi`, `/pre-test`, atau `/video` kecuali keputusan UX berikutnya memang meminta halaman mandiri.

CTA **Ikuti Pelatihan** tetap berada di halaman program. Jangan mengasumsikan route pendaftaran atau login peserta sudah tersedia karena alur akses/pendaftaran peserta perlu mengikuti keputusan bisnis yang telah dikonfirmasi.

### 3.2 Admin

Admin dan Auditor memakai satu halaman login. Setelah autentikasi, server mengarahkan masing-masing role ke dashboard yang sesuai.

| URL target | Fungsi |
|---|---|
| `/masuk` | Login bersama Admin/Auditor; pertahankan sebagai route aktif |
| `/login` | Alias opsional yang redirect ke `/masuk`, bila diperlukan untuk URL yang lebih umum |
| `/admin` | Dashboard Admin |
| `/admin/kelola-program` | Daftar dan pengelolaan program pelatihan |
| `/admin/kelola-program/:slug` | Editor satu program dan section kontennya |
| `/admin/kelola-akun` | Daftar akun Auditor |
| `/admin/kelola-akun/:id` | Detail/edit akun Auditor |

Kelola Program menjadi satu area kerja yang mencakup konten pelatihan, materi, tes, SOP, serta data pendukung/departemen sesuai hak akses Admin. Bagian tersebut dapat menggunakan tab/query parameter, tidak harus menjadi banyak halaman baru.

Route lama seperti `/admin/program-training`, `/admin/sop`, `/admin/departemen`, `/admin/sesi`, dan `/admin/checklist` **jangan langsung dihapus**. Pindahkan bertahap setelah form, tautan internal, otorisasi, dan alur data sudah disesuaikan. Route Kelola Akun pada tabel adalah target; endpoint/halamannya perlu dipastikan implementasinya.

Logout tetap menggunakan POST dengan perlindungan CSRF (`/admin/keluar` dan `/auditor/keluar`). Jangan mengganti logout menjadi GET tanpa pertimbangan keamanan.

### 3.3 Auditor

| URL target | Fungsi | Status |
|---|---|---|
| `/auditor` | Dashboard Auditor | Sudah ada |
| `/auditor/penugasan/:id` | Checklist penugasan | Sudah ada |
| `/auditor/penugasan/:id/temuan` | Daftar/tambah temuan untuk penugasan | Sudah ada |
| `/auditor/penugasan/:id/laporan` | Laporan hasil audit | Sudah ada |
| `/auditor/sop` | Pustaka SOP | Sudah ada |
| `/auditor/sop/:id` | Detail SOP | Sudah ada |

Pertahankan konteks penugasan pada URL temuan dan laporan agar temuan tetap terhubung dengan penugasan audit yang benar. Fitur cetak dapat menggunakan halaman laporan yang sama dengan tampilan print, kecuali nanti dibutuhkan route khusus.

## 4. Penyesuaian API yang perlu dievaluasi

Route tes peserta saat ini masih memuat segmen `/pertemuan/:n`, sedangkan struktur konten terbaru tidak lagi menampilkan pembagian Pertemuan 1/2. Setelah model data dan layanan tes disesuaikan, evaluasi bentuk URL yang lebih konsisten:

```text
GET  /api/public/programs/:slug/tests/:type
POST /api/public/tests/:testId/attempts
```

Perubahan endpoint harus dilakukan bersamaan dengan perubahan pemanggil di frontend, validasi, service, dan pengujian. Jangan hanya mengubah path router karena kontrak endpoint dan query database dapat bergantung pada nomor pertemuan.

## 5. Aturan implementasi agar routing tidak bentrok

1. Semua halaman publik peserta berada di Next.js (`apps/web/src/app`).
2. Semua halaman login/Admin/Auditor tetap berada di Express/EJS (`apps/api/src/web`) selama arsitektur belum dipindahkan.
3. Endpoint data berada di Express API (`apps/api/src/routes`) dan menggunakan prefix `/api`.
4. Login Admin/Auditor tetap satu pintu; role ditentukan di server dan akses setiap route tetap dilindungi middleware.
5. Anchor section menggunakan ID HTML yang konsisten dan tautan internal diarahkan ke slug program yang benar.
6. Perubahan route harus memperbarui seluruh link, form action, redirect, middleware, dan test yang terkait.
7. Pertahankan route lama dengan redirect/kompatibilitas hanya setelah method, CSRF, dan alur autentikasinya diperiksa. Jangan melakukan redirect otomatis untuk seluruh request POST.
8. Jangan menambahkan route `/uploads/*` atau URL file lokal sebelum mekanisme penyimpanan dan penyajian file benar-benar tersedia.

## 6. Checklist validasi

- [ ] Homepage publik terbuka melalui `/`.
- [ ] Katalog dan tautan setiap program menuju slug yang benar.
- [ ] Semua section pada halaman program bisa dituju melalui anchor.
- [ ] Peserta dapat mengakses halaman pelatihan tanpa login.
- [ ] Admin dan Auditor login melalui satu halaman.
- [ ] Admin diarahkan ke `/admin`; Auditor diarahkan ke `/auditor`.
- [ ] Peserta tidak dapat membuka route Admin/Auditor.
- [ ] Admin tidak dapat membuka fungsi khusus Auditor dan sebaliknya.
- [ ] Logout menggunakan POST dan CSRF.
- [ ] Route lama tidak menghasilkan tautan rusak selama masa transisi.
- [ ] Endpoint tes cocok dengan struktur konten baru.
- [ ] Typecheck, test, lint (jika berlaku), dan build berhasil.

---
Dokumen acuan routing Sopinsya — Capstone Kelompok 1, kelas 4KA23.

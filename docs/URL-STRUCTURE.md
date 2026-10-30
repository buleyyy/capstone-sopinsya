# Struktur URL Sopinsya

Dokumen ini adalah hasil review struktur URL berdasarkan kode pada branch `feat/admin-program-training` (acuan branch lokal tim per 30 Oktober 2026). Dokumen ini berada di branch dokumentasi `feature/url-structure-sync`.

Tujuannya membedakan **route yang benar-benar ada**, **route target**, dan **gap yang belum diimplementasikan**. Daftar route aktif di bawah bukan hasil asumsi dari rancangan UI.

## 1. Arsitektur aplikasi dan batas routing

Repository: `buleyyy/capstone-sopinsya`

Root project lokal tim:

```text
D:\\capstone_project\\capstone-sopinsya
```

| Bagian | Lokasi | Tanggung jawab saat ini |
|---|---|---|
| Web publik/peserta | `apps/web/src/app` | Next.js App Router |
| Login, Admin, Auditor | `apps/api/src/web` | Express + EJS |
| API | `apps/api/src/routes` | Endpoint JSON |
| Data dan aturan domain | `apps/api/src/domain`, `services` | Validasi dan proses aplikasi |

**Penting untuk deployment:** Next.js dan Express sama-sama memiliki handler untuk path root `/`. Express juga melayani `/masuk`, `/admin/*`, `/auditor/*`, dan `/api/*`. Repository yang diperiksa belum menunjukkan konfigurasi reverse proxy yang membagi path tersebut pada satu domain. Di development, frontend dan API dikonfigurasi melalui origin/port terpisah (`NEXT_PUBLIC_API_BASE_URL`); jangan menganggap single-domain routing sudah tersedia sebelum konfigurasi deploy dibuat dan diuji.

Status yang digunakan:
- **Aktif** — route ditemukan pada kode branch acuan.
- **Target** — usulan URL untuk penyesuaian berdasarkan keputusan produk.
- **Belum ada** — path belum memiliki implementasi pada branch acuan.
- **Perlu konfirmasi** — perilaku/UX masih harus dipastikan; jangan mengunci route berdasarkan asumsi.

## 2. Route yang sudah ada pada kode

### 2.1 Web publik — Next.js

| Method | URL | Fungsi saat ini | Status |
|---|---|---|---|
| GET | `/` | Landing page, hero, dan daftar program yang diikuti/tersedia | Aktif |
| GET | `/program` | Browse program, pencarian, filter kategori, dan daftar program yang diikuti | Aktif |
| GET | `/program/:slug` | Detail program dengan konten yang dikelompokkan per pertemuan | Aktif |
| GET | `/tentang-kami` | Halaman informasi Sopinsya | Aktif |

Navigasi header saat ini masih menampilkan **Beranda**, **Program**, **Tentang Kami**, dan **Hubungi Kami**. Tautan Hubungi Kami dibaca dari `NEXT_PUBLIC_WHATSAPP_URL`; jika kosong, diarahkan ke `/tentang-kami#kontak`.

### 2.2 Login, Admin, dan Auditor — Express/EJS

#### Login bersama

| Method | URL | Fungsi saat ini | Status |
|---|---|---|---|
| GET | `/` | Redirect berdasarkan sesi Admin/Auditor; jika belum login ke `/masuk` | Aktif di Express |
| GET | `/masuk` | Halaman login bersama | Aktif |
| POST | `/masuk` | Memproses login lalu redirect sesuai role | Aktif |
| GET | `/admin/masuk` | Redirect 303 ke `/masuk` | Aktif (alias lama) |
| GET | `/undangan/:token` | Saat ini hanya redirect 303 ke `/masuk`; belum memproses token undangan | Redirect saja |

**Model autentikasi saat ini belum sama dengan target pengelolaan akun client.** Email pada halaman login hanya memilih role. Admin memakai `ADMIN_PASSWORD`; Auditor memakai `AUDITOR_PASSWORD`. Implementasi Admin saat ini didokumentasikan di kode sebagai satu akun/password untuk UAT. Belum ditemukan halaman atau endpoint `/admin/kelola-akun` untuk CRUD akun Auditor secara individual.

#### Admin

| Method | URL | Fungsi saat ini | Status |
|---|---|---|---|
| GET | `/admin` | Dashboard Admin | Aktif |
| GET, POST | `/admin/departemen` | Daftar dan pembuatan departemen | Aktif |
| GET | `/admin/checklist` | Daftar master checklist | Aktif |
| POST | `/admin/checklist/standar` | Membuat standar checklist | Aktif |
| POST | `/admin/checklist/versi` | Membuat versi checklist | Aktif |
| GET | `/admin/checklist/:id` | Detail versi checklist | Aktif |
| POST | `/admin/checklist/:id/item` | Menambah item checklist | Aktif |
| POST | `/admin/checklist/:id/terbit` | Menerbitkan versi checklist | Aktif |
| GET, POST | `/admin/sesi` | Daftar dan pembuatan sesi audit | Aktif |
| GET | `/admin/sesi/:id` | Detail sesi audit | Aktif |
| POST | `/admin/sesi/:id/aktifkan` | Mengaktifkan sesi | Aktif |
| POST | `/admin/sesi/:id/perpanjang` | Memperpanjang sesi | Aktif |
| POST | `/admin/sesi/:id/tutup` | Menutup sesi | Aktif |
| POST | `/admin/sesi/:id/auditor` | Menambahkan Auditor ke sesi | Aktif |
| POST | `/admin/sesi/:id/auditor/:auditorId/terbit-ulang` | Menerbitkan ulang undangan Auditor | Aktif |
| POST | `/admin/sesi/:id/auditor/:auditorId/cabut` | Mencabut akses Auditor pada sesi | Aktif |
| POST | `/admin/sesi/:id/penugasan` | Membuat penugasan audit | Aktif |
| GET | `/admin/program-training` | Halaman pengelolaan resource dan tes pelatihan | Aktif |
| POST | `/admin/program-training/resource` | Membuat resource pelatihan | Aktif |
| POST | `/admin/program-training/resource/:id` | Memperbarui resource | Aktif |
| POST | `/admin/program-training/resource/:id/publikasi` | Mengubah publikasi resource | Aktif |
| POST | `/admin/program-training/test` | Membuat tes | Aktif |
| POST | `/admin/program-training/test/:id/question` | Menambah pertanyaan tes | Aktif |
| POST | `/admin/program-training/test/:id/status` | Mengubah status tes | Aktif |
| POST | `/admin/program-training/question/:id/status` | Mengubah status pertanyaan | Aktif |
| GET | `/admin/sop` | Pustaka SOP Admin | Aktif |
| POST | `/admin/sop/Program` | Membuat kategori/program SOP | Aktif; huruf `P` kapital |
| POST | `/admin/sop/dokumen` | Membuat dokumen SOP | Aktif |
| POST | `/admin/sop/Program/:id/publikasi` | Mengubah publikasi kategori/program SOP | Aktif; huruf `P` kapital |
| POST | `/admin/sop/dokumen/:id/publikasi` | Mengubah publikasi dokumen SOP | Aktif |
| POST | `/admin/keluar` | Logout Admin | Aktif |

Tidak ditemukan route `/admin/kelola-program` maupun `/admin/kelola-akun` pada branch acuan. Kelola Program yang diinginkan client saat ini masih tersebar di route program-training, SOP, dan departemen. Pengelolaan Auditor yang ada melalui sesi/penugasan tidak sama dengan fitur CRUD akun Auditor.

#### Auditor

| Method | URL | Fungsi saat ini | Status |
|---|---|---|---|
| GET | `/auditor` | Dashboard Auditor | Aktif |
| GET, POST | `/auditor/penugasan/:id` | Melihat dan menyimpan checklist penugasan | Aktif |
| GET, POST | `/auditor/penugasan/:id/temuan` | Daftar dan membuat temuan | Aktif |
| POST | `/auditor/temuan/:id/tindak-lanjut` | Menyimpan tindak lanjut temuan | Aktif |
| POST | `/auditor/temuan/:id/tutup` | Menutup temuan | Aktif |
| GET | `/auditor/penugasan/:id/laporan` | Laporan hasil audit | Aktif |
| GET | `/auditor/sop` | Daftar Pustaka SOP Auditor | Aktif |
| GET | `/auditor/sop/:id` | Detail dokumen SOP | Aktif |
| POST | `/auditor/keluar` | Logout Auditor | Aktif |

Operasi perubahan data memakai POST dan perlindungan CSRF sesuai middleware route. Pertahankan method tersebut saat merapikan URL.

### 2.3 API — Express

Prefix `/api` dipasang di `apps/api/src/app.ts`.

| Method | URL | Fungsi saat ini | Status |
|---|---|---|---|
| GET | `/api/health` | Health check API | Aktif |
| GET | `/api/health/db` | Health check database | Aktif |
| GET | `/api/public/rooms` | Daftar kamar/kategori materi publik | Aktif |
| GET | `/api/public/rooms/:id` | Detail kamar/kategori materi | Aktif |
| GET | `/api/public/programs/:slug/pertemuan/:n/tests/:type` | Mengambil pre-test/post-test untuk program dan nomor pertemuan | Aktif |
| POST | `/api/public/tests/:testId/attempts` | Mengirim percobaan tes peserta | Aktif |

Klien frontend saat ini memanggil endpoint tes dengan segmen `/pertemuan/:n`; jangan menghapus segmen itu hanya dari router karena data, validasi, service, dan pemanggil frontend masih menggunakannya.

## 3. Temuan ketidaksesuaian yang perlu ditangani

Temuan berikut berasal dari pemeriksaan implementasi branch acuan, bukan fitur yang diasumsikan sudah ada.

| Area | Kondisi kode saat ini | Dampak / tindakan |
|---|---|---|
| Navigasi publik | Header masih menampilkan Beranda dan mengarahkan Program ke `/program` | Belum sesuai arah client yang menginginkan navigasi Program, Tentang Kami, Hubungi Kami |
| Katalog | `/` adalah landing page; `/program` adalah halaman browse dengan pencarian dan filter kategori | Arah client menyebut homepage sebagai katalog dan filter/kategori tidak dipakai; perlu penyesuaian UI dan keputusan kompatibilitas URL |
| Detail program | `/program/:slug` menampilkan konten berdasarkan pertemuan | Client meminta urutan materi yang tidak lagi ditonjolkan sebagai Pertemuan 1/2; model dan UI perlu disejajarkan |
| Studi Kasus | Komponen detail membuat link ke `/program/:slug/pertemuan/:id/studi-kasus` | Halaman Next.js untuk path ini tidak ditemukan pada branch acuan; link berpotensi 404 |
| Video Referensi | Komponen detail membuat link ke `/program/:slug/pertemuan/:id/video` | Halaman Next.js untuk path ini tidak ditemukan pada branch acuan; link berpotensi 404 |
| Pre/Post-test | Ditampilkan melalui dialog, API memerlukan nomor pertemuan | Perlu refactor bersama model konten bila struktur pertemuan dihapus |
| Admin | Program training, SOP, departemen, sesi audit, dan checklist memakai route terpisah | Target client menginginkan area Kelola Program yang terintegrasi; perlu migrasi bertahap |
| Kelola Akun | Belum ada route `/admin/kelola-akun`; login memakai password dari environment per role | Perlu desain autentikasi dan CRUD akun Auditor; jangan hanya membuat menu tanpa backend dan otorisasi |
| Pustaka SOP | Route Admin memakai segmen `/Program` dengan huruf kapital | Perhatikan case-sensitive routing di Linux; normalisasi ke huruf kecil hanya sebagai perubahan terencana dan sertakan kompatibilitas |
| Footer | Ada tautan `/Program` kapital selain `/program` | Periksa dan rapikan tautan agar tidak mengarah ke path yang berbeda/case-sensitive |
| Storage | Resource pelatihan divalidasi sebagai URL HTTPS; belum ada bukti route publik `/uploads/*` | Jangan menambahkan route unggah/unduh file sebelum keputusan storage dan kontrol akses ditetapkan |

## 4. Target arah produk dan rancangan URL

Bagian ini memuat rancangan produk. Keputusan pola halaman peserta opsi A sudah dikonfirmasi pada 30 Oktober 2026 dan implementasi awalnya sudah dilakukan pada branch ini.

### 4.1 Peserta

**Implementasi branch ini:** homepage menampilkan katalog langsung; navigasi Program menuju `/#program`; route `/program` me-redirect ke `/#program`; kartu program menuju `/program/:slug`; halaman detail menyajikan bagian konten dalam satu alur panjang. Pre-test/post-test tetap memanggil API yang ada per pertemuan. Tautan Studi Kasus dan Video Referensi kini dibuka langsung sebagai resource eksternal, bukan menuju route Next.js yang belum ada. Rating/ulasan ditandai belum tersedia karena belum ada alur penyimpanan maupun endpoint.

Arah UX dari pembahasan client terbaru:
- Homepage menjadi katalog/entry point utama.
- Navigasi utama: **Program**, **Tentang Kami**, **Hubungi Kami**; menu Beranda terpisah tidak diperlukan.
- Filter kategori dan halaman browse terpisah tidak menjadi bagian dari arah UX yang dibahas.
- Konten pelatihan ditata berurutan: Silabus → Materi → Studi Kasus → Pre-test → Post-test → tautan kuis → Video Referensi → Pustaka SOP → Rating dan Ulasan.
- Informasi sesi offline seperti hari, lokasi, dan jadwal tidak ditampilkan; informasi trainer tetap relevan.
- Peserta tidak membutuhkan login untuk mencoba konten/tes pada alur trial yang dibahas.

**Keputusan dikonfirmasi (30 Oktober 2026): Opsi A — halaman detail per program.** Homepage menampilkan katalog; klik kartu membuka `/program/:slug`; seluruh rangkaian konten program ditampilkan dalam satu halaman panjang (*long-scroll*). Halaman browse/filter terpisah tidak menjadi alur utama. Route `/program` dipertahankan sebagai kompatibilitas dan diarahkan ke `/#program`.

Anchor berikut merupakan bagian dari implementasi Opsi A pada halaman detail program:

| Target URL | Fungsi |
|---|---|
| `/#program` | Menuju katalog pada homepage |
| `/program/:slug#silabus` | Section silabus pada halaman detail program |
| `/program/:slug#materi` | Section materi |
| `/program/:slug#studi-kasus` | Section studi kasus |
| `/program/:slug#pre-test` | Section pre-test |
| `/program/:slug#post-test` | Section post-test |
| `/program/:slug#video-referensi` | Section video referensi |
| `/program/:slug#pustaka-sop` | Section Pustaka SOP |
| `/program/:slug#ulasan` | Section rating dan ulasan |

Anchor di atas mengarah ke section dalam satu halaman detail, bukan route per-konten. Jangan membuat route mandiri `/materi`, `/pre-test`, atau `/video` tanpa kebutuhan UX baru yang telah disetujui.

CTA **Ikuti Pelatihan** dan daftar pelatihan yang diikuti perlu dipertahankan hanya dengan mekanisme akses yang disepakati. Alur registrasi dan identitas peserta tetap mengikuti keputusan bisnis yang belum final; jangan menganggap localStorage sebagai sistem akun.

### 4.2 Admin

Target navigasi yang diinginkan client:

| URL target | Fungsi | Status |
|---|---|---|
| `/masuk` | Login bersama Admin/Auditor | Aktif |
| `/admin` | Dashboard Admin | Aktif |
| `/admin/kelola-program` | Area terpadu pengelolaan program, materi, tes, SOP, dan data pendukung | Target — belum ada |
| `/admin/kelola-akun` | Kelola akun Auditor (buat, aktif/nonaktif, reset password) | Target — belum ada |

Subhalaman seperti `/admin/kelola-program/:slug` atau `/admin/kelola-akun/:id` hanya dipakai bila dibutuhkan oleh rancangan implementasi. Alternatif tab/query parameter dapat dipakai tanpa menambah route.

Route lama `/admin/program-training`, `/admin/sop`, `/admin/departemen`, `/admin/sesi`, dan `/admin/checklist` jangan dihapus sekaligus. Migrasikan satu per satu setelah form, tautan internal, service, hak akses, dan tes sudah disesuaikan. Untuk route lama yang masih dibookmark, rencanakan redirect berdasarkan method; jangan mengalihkan seluruh POST secara otomatis.

### 4.3 Auditor

Pertahankan struktur route Auditor yang sudah ada sampai kebutuhan cetak laporan dan tampilan dashboard diselesaikan. Fitur cetak dapat menggunakan halaman laporan yang sama dengan CSS print apabila kebutuhan tidak menuntut route terpisah.

## 5. API dan perubahan kontrak yang perlu dievaluasi

Endpoint tes sekarang:

```text
GET /api/public/programs/:slug/pertemuan/:n/tests/:type
POST /api/public/tests/:testId/attempts
```

Jika model program tidak lagi menggunakan pertemuan, kandidat endpoint baca tes adalah:

```text
GET /api/public/programs/:slug/tests/:type
POST /api/public/tests/:testId/attempts
```

Perubahan tersebut harus dilakukan sebagai satu pekerjaan lintas lapisan:
1. Skema/model dan relasi data tes.
2. Validasi request dan service backend.
3. Route API dan test backend.
4. Klien frontend yang memuat tes.
5. Admin editor untuk mengelola pre-test/post-test.
6. Seed/data lama bila masih dipakai.

Jangan mengubah URL endpoint sebelum keputusan model data dan migrasi disepakati. Pertahankan kunci jawaban dan aturan penilaian di server; jangan mengirim jawaban benar pada payload soal peserta.

## 6. Aturan implementasi routing dan keamanan

1. Route publik peserta berada di Next.js selama arsitektur tidak berubah.
2. Login/Admin/Auditor tetap di Express/EJS selama belum ada keputusan migrasi framework.
3. API JSON memakai prefix `/api`.
4. Login Admin/Auditor tetap satu pintu melalui `/masuk`; role dan otorisasi ditentukan di server.
5. Semua route Admin harus tetap dilindungi middleware Admin; route Auditor harus dilindungi middleware Auditor.
6. Perubahan path wajib memperbarui link, form action, redirect, middleware, dan automated test.
7. Operasi mutasi tetap memakai POST dengan pemeriksaan origin/CSRF yang sesuai.
8. Perhatikan case-sensitive path ketika deployment ke Linux.
9. Jangan menambahkan `/uploads/*` atau menyajikan file lokal sebelum storage, validasi file, kontrol akses, dan kebijakan retensi ditetapkan.
10. Jangan menganggap satu-domain reverse proxy sudah tersedia; tambahkan dan uji konfigurasi deployment secara terpisah.

## 7. Checklist validasi implementasi berikutnya

- [x] Struktur homepage dan perilaku klik katalog dikonfirmasi: katalog di homepage, detail per program (Opsi A).
- [x] Header mengikuti menu Program, Tentang Kami, dan Hubungi Kami.
- [x] Link Studi Kasus dan Video Referensi pada detail program tidak lagi menuju route yang tidak tersedia; keduanya memakai URL resource yang tersedia.
- [ ] Struktur konten tidak lagi bergantung pada pertemuan jika keputusan model sudah berubah.
- [ ] Pre-test/post-test tetap dapat dimuat dan dinilai oleh backend.
- [ ] Admin dan Auditor memakai satu gerbang login dan redirect sesuai role.
- [ ] Halaman Kelola Program terintegrasi dengan service dan data yang benar.
- [ ] Kelola Akun memiliki CRUD, reset password, status akun, dan otorisasi server.
- [ ] Route lama dipertahankan atau diberi redirect yang aman selama transisi.
- [ ] Path dengan kapitalisasi tidak menyebabkan 404 di Linux.
- [ ] API, form, redirect, CSRF, dan middleware diuji setelah perubahan.
- [ ] Typecheck, test, lint (jika berlaku), dan build berhasil.
- [ ] Reverse proxy dan konfigurasi production diuji pada environment deployment.

---

Dokumen acuan routing Sopinsya — Capstone Kelompok 1, kelas 4KA23.

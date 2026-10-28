# UAT — Manajemen Program Training

## Perubahan
- Menu sidebar baru **Program Training** membuka satu halaman dengan tab Program, Materi & Konten, dan Pre/Post-test.
- Konten pendukung disimpan pada tabel `TrainingResource` dan dikaitkan ke slug program serta nomor pertemuan yang sudah ada di `apps/web/src/lib/programs.ts`.
- Admin dapat menambah, mengubah, dan mengatur publikasi konten pendukung (silabus, materi eksternal, studi kasus, video, Blooket, tautan lain).
- Admin dapat membuat/memperbarui pre-test/post-test, menambah soal dan pilihan A–D, memilih kunci jawaban, serta menonaktifkan tes/soal tanpa menghapus riwayat.
- Semua POST pada halaman admin memakai pemeriksaan origin dan CSRF yang sudah digunakan halaman Admin lain.
- URL konten dibatasi ke HTTPS tanpa kredensial.

## Batasan yang perlu diketahui
- Metadata utama program (nama, deskripsi, durasi, trainer, dan definisi pertemuan) masih statis di `apps/web/src/lib/programs.ts`; tab Program menampilkan katalog yang ada, bukan CRUD metadata program.
- Materi pendukung yang diterbitkan belum dikonsumsi oleh frontend peserta. Perubahan ini menyiapkan pengelolaan Admin; integrasi API publik dan frontend peserta perlu tahap lanjutan.
- PDF/SOP tetap dikelola melalui menu Pustaka SOP untuk menghindari duplikasi mekanisme file.
- Pemeriksaan build dan test belum dijalankan di lingkungan repository ini. Jangan anggap perubahan siap produksi sebelum validasi lokal.

## Setup dan migrasi
Dari root repository:

```powershell
npm install
npm run db:generate
```

Pastikan `DATABASE_URL` sudah terkonfigurasi pada `apps/api/.env`, lalu periksa backup database sebelum menerapkan migrasi tambahan:

```powershell
cd apps/api
npx prisma migrate deploy --schema prisma/schema.prisma
cd ../..
npm run typecheck
npm test
npm run build
```

Jangan gunakan `prisma migrate reset`; migrasi ini menambahkan tabel baru dan tidak dimaksudkan untuk menghapus data.

## Checklist UAT Admin
- [ ] Login Admin dan buka **Program Training** dari sidebar.
- [ ] Tambahkan konten HTTPS untuk program dan pertemuan yang benar; pastikan muncul pada tabel.
- [ ] Edit judul/tautan/kategori/urutan konten; muat ulang halaman dan pastikan data tetap tersimpan.
- [ ] Terbitkan/tarik publikasi konten.
- [ ] Buat pre-test dan post-test untuk kombinasi program/pertemuan berbeda.
- [ ] Simpan kembali kombinasi tes yang sama; pastikan tidak membuat tes duplikat dan soal lama tetap ada.
- [ ] Tambahkan soal dengan minimal dua pilihan dan kunci jawaban yang termasuk pilihan terisi.
- [ ] Pastikan kunci jawaban tidak ditampilkan oleh endpoint peserta.
- [ ] Nonaktifkan soal yang sudah pernah dijawab; pastikan riwayat jawaban tidak terhapus.
- [ ] Pastikan pengguna tanpa sesi Admin ditolak pada seluruh POST.
- [ ] Pastikan halaman audit, Pustaka SOP, dan login tetap berfungsi.

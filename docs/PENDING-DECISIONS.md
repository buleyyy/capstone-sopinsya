# Keputusan Tertunda

Belum boleh diasumsikan di kode. Dampaknya pada fase berikutnya:

| Kode | Keputusan | Dampak |
| --- | --- | --- |
| E-4 | Tipe soal, bobot, passing grade, batas waktu, batas percobaan | Skema tabel tes/soal/percobaan dan logika penilaian (Fase 4) |
| E-5 | Peserta daftar sendiri atau akun dibuat admin | Alur registrasi, endpoint auth, aturan persetujuan (Fase 2-3) |
| E-6 | Materi berupa unggahan file atau hanya URL | Storage, batas ukuran, keamanan upload (Fase 3) |
| E-7 | Format laporan: CSV / Excel / PDF / lain | Library ekspor dan target waktu rekap < 1 menit (Fase 4) |
| - | Hosting, domain, strategi deployment | Konfigurasi production, CORS, cookie/session |
| - | Jumlah peserta, backup, retensi data | Indeks DB, kapasitas, kebijakan backup |
| - | Detail jadwal dan aturan persetujuan registrasi | Model jadwal dan status registrasi (Fase 3) |
| - | Integrasi WhatsApp (tautan saja atau lebih) | Modul kontak (RD: belum dikonfirmasi) |

## Fokus audit internal ISO 37001 / SMAP (notulensi terbaru)

Keputusan sementara tim (belum final dari klien): akses trial memakai kode sesi tanpa email/password;
kategori materi (13 Program) dipisah dari departemen; PDF berupa URL; modul RD lama tidak dihapus
sampai scope final dikonfirmasi.

| Kode | Keputusan yang dibutuhkan | Dampak jika berubah |
| --- | --- | --- |
| A-1 | Nilai hasil checklist: hanya Ya/Tidak, atau ada N/A / Sebagian? (sementara: `YA`, `TIDAK`) | Enum `AnswerResult` (migrasi) dan validasi |
| A-2 | Arti "status pengerjaan" (sementara: `BELUM_DIKERJAKAN`, `DALAM_PROSES`, `SELESAI`) dan aturan konsistensinya dengan hasil | Enum `AnswerProgress`, `saveAnswerSchema` |
| A-3 | Apakah satu auditor hanya punya satu departemen asal? | Aturan audit-sendiri, `Auditor.departmentId` |
| A-4 | Siapa menentukan penugasan: auditor memilih sendiri atau trainer menugaskan? | Endpoint dan hak akses `AuditAssignment` |
| A-5 | Daftar departemen dan isi 13 Program (data dari Mas Iki); apakah SOP dimiliki satu departemen saja | Seed data; `SopDocument.departmentId` |
| A-6 | Apakah poin checklist selalu terkait satu SOP | `ChecklistItem.sopId` wajib atau opsional |
| A-7 | Perlakuan sesi setelah `CLOSED` (jawaban/temuan terkunci? masih boleh dibaca untuk laporan?) | Middleware sesi (saat ini menolak semua akses bila sesi tidak ACTIVE) |
| A-8 | Retensi data sesi setelah training (boleh dihapus?) | `onDelete`, kebijakan backup |
| A-9 | Alur tindak lanjut/verifikasi temuan (status, siapa memverifikasi, batas waktu) | Belum ada tabel; rencana tabel `FindingFollowUp` 1:N agar `Finding` tidak berubah |
| A-10 | Satu atau banyak tautan bukti per jawaban/temuan | Saat ini satu `evidenceUrl`; banyak bukti = tabel baru |
| A-11 | Hak akses rinci Auditor/Trainer/Admin dan cara trainer/admin masuk (kode terpisah?) | Middleware dan endpoint pengelolaan sesi (belum dibuat) |
| A-12 | Rumus persentase dashboard dan format ekspor | Dashboard dan ekspor ditunda |

## Risiko PDF/bukti berbasis URL

- URL hanya referensi; tautan "anyone with the link" membuat dokumen internal instansi dapat dibuka
  siapa pun yang memegang tautan, di luar kontrol kode sesi.
- Tautan dapat mati atau berubah tanpa sepengetahuan aplikasi.
- Mitigasi sekarang: hanya `https://` tanpa kredensial (divalidasi backend). Unggah file ke server
  dipertimbangkan setelah E-6 diputuskan.

## Batasan akses kode sesi

- Kode sesi bukan autentikasi: pemegang kode dapat mendaftar dengan nama dan departemen yang ia klaim sendiri.
- Mitigasi: kode berumur pendek (`expiresAt`), dapat ditutup (`CLOSED`), hanya hash yang disimpan,
  token auditor acak per perangkat. Rate limit pada endpoint join belum dibuat.

# Catatan migrasi test: undangan → akun Auditor

Perubahan flow Auditor: undangan/token dan password Auditor bersama dihapus; Auditor memakai akun individual
(email + password) yang dibuat Admin. Test yang menguji perilaku lama **tidak lagi relevan**; berikut padanannya.

| Test lama (dihapus/diganti) | Alasan tidak relevan | Pengganti |
|---|---|---|
| `auditService.test.ts` › "klaim undangan dan sesi login" (klaim, kedaluwarsa, hash token, logout, terbit ulang) | Fungsi `claimInvitation`, `authenticate`, `logout`, `reissueInvitation` dihapus | `auditService.test.ts` › "login akun Auditor dan resolusi sesi" (kredensial, nonaktif, dicabut, sesi ditutup, tanpa sesi, tidak ada fungsi undangan) |
| `passwordLogin.test.ts` › `resolvePasswordLogin` / `authenticateById` (memilih auditor pertama sesi ACTIVE) | Login password bersama dihapus | `authenticateAccount` (diuji di atas) dan `passwordLoginFlow.test.ts` |
| `passwordLogin.test.ts` › `checkAuditorPassword`, `auditorEnabled`, cookie berisi id auditor | `AUDITOR_PASSWORD` dihapus; cookie kini berisi id akun | `passwordLogin.test.ts` › "WebSecurity: cookie Auditor berbasis akun" |
| `sessionAccess.test.ts` › `requireAuditor` (token sesi di database) | Middleware token dihapus; autentikasi memakai cookie bertanda tangan + akun | `readCookie`/`getAuditContext` tetap diuji; alur HTTP di `passwordLoginFlow.test.ts` |
| `passwordLoginFlow.test.ts` › "tautan undangan lama dialihkan" | Route `/undangan/:token` dihapus | Test baru: `/undangan/*` mengembalikan 404 |
| `adminService.test.ts` › `createAuditor`, `reissueInvitation`, klaim pada DRAFT | Diganti `addAuditorToSession`, `restoreAuditor` | blok "akun Auditor" dan "auditor dan penugasan" |
| `auditRules.test.ts` › `isInviteClaimable` | Aturan I3 undangan dihapus | — (tidak ada padanan; konsep hilang) |

Test yang **dipertahankan** tanpa perubahan perilaku: aturan akses sesi, self-audit, isolasi antar-auditor, jawaban
checklist, versi checklist, temuan (idempotensi, penutupan, tindak lanjut), dashboard, enum schema.

Helper test (`tests/helpers/seed.ts`): `inv1/inv2` (undangan) diganti `acc1/acc2` (akun), `aud1/aud2` (keanggotaan);
`login(store, accountId)` menggantikan klaim token. Hash password dihitung sekali per proses agar suite tetap cepat.

`MemoryStore` sebelumnya tidak mengimplementasikan `listDepartments` dan `findLatestPublishedVersion` (ada di
interface `AuditStore`); keduanya ditambahkan agar `tsc` tidak gagal pada `implements AuditStore`.

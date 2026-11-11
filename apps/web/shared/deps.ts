import type { AdminReadStore } from "../admin/readStore.js";
import type { AccountStore } from "../../api/src/domain/accountStore.js";
import type { AuditStore } from "../../api/src/domain/auditStore.js";
import type { EvidenceStore } from "../../api/src/domain/evidenceFile.js";
import type { PublicContentStore } from "../../api/src/domain/publicContent.js";
import { AppError } from "../../api/src/utils/errors.js";
import type { WebSecurity } from "./security.js";

export interface WebDeps {
  store: AuditStore | undefined;
  admin: AdminReadStore | undefined;
  /** Akun Admin/Auditor (autentikasi utama). Tanpa ini, login akun tidak tersedia. */
  accounts: AccountStore | undefined;
  /** Penyimpanan berkas bukti unggahan Auditor. Tanpa ini, unggah bukti menjawab 503 (tautan https tetap bisa dipakai). */
  evidence?: EvidenceStore | undefined;
  /** FALLBACK SEMENTARA: login kata sandi environment. Lihat docs/AUTH-ACCOUNTS.md untuk rencana penghapusan. */
  legacyEnvLogin: boolean;
  publicContent: PublicContentStore | undefined;
  sec: WebSecurity;
  /** Origin publik aplikasi (APP_ORIGIN); dipakai membentuk tautan undangan. */
  appOrigin?: string | undefined;
  /** Email peran pada gerbang masuk bersama (huruf kecil). Email hanya memilih peran. */
  loginEmails: { admin: string; auditor: string };
}

const noDb = () => new AppError(503, "DB_NOT_CONFIGURED", "Database belum dikonfigurasi atau belum siap");

export function requireStore(deps: WebDeps): AuditStore {
  if (!deps.store) throw noDb();
  return deps.store;
}

export function requireAdminStore(deps: WebDeps): AdminReadStore {
  if (!deps.admin) throw noDb();
  return deps.admin;
}

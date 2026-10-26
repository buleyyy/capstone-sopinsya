import type { AdminReadStore } from "./adminReadStore.js";
import type { AuditStore } from "../domain/auditStore.js";
import type { PublicContentStore } from "../domain/publicContent.js";
import { AppError } from "../utils/errors.js";
import type { WebSecurity } from "./security.js";

export interface WebDeps {
  store: AuditStore | undefined;
  admin: AdminReadStore | undefined;
  publicContent: PublicContentStore | undefined;
  sec: WebSecurity;
  /** Origin publik aplikasi (APP_ORIGIN); dipakai membentuk tautan undangan. */
  appOrigin?: string | undefined;
  /** Email login staf (huruf kecil). Email Auditor dipertahankan untuk kompatibilitas konfigurasi lama. */
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

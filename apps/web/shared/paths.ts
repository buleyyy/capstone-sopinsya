import fs from "node:fs";
import path from "node:path";

/**
 * Akar apps/web (tempat views/ dan public/ berada).
 * Dari sumber (tsx) ia ada satu tingkat di atas shared/; dari hasil build (dist/web/shared) berkas itu tidak ikut,
 * sehingga dipakai cwd (npm -w menjalankan skrip dengan cwd = apps/web).
 */
const here = path.resolve(__dirname, "..");
export const WEB_ROOT = fs.existsSync(path.join(here, "views")) ? here : process.cwd();

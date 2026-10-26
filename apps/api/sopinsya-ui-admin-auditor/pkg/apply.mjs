// Jalankan dari folder apps/api:  node apply.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const copy = ["views/partials/footer.ejs","views/masuk.ejs","views/admin/beranda.ejs","views/auditor/beranda.ejs"];
for (const f of copy) { fs.copyFileSync(path.join(here, f), path.join(root, f)); console.log("tulis", f); }

const nav = {
  "views/admin/sesi.ejs":"sesi","views/admin/sesi-detail.ejs":"sesi",
  "views/admin/checklist.ejs":"checklist","views/admin/versi.ejs":"checklist",
  "views/admin/departemen.ejs":"departemen","views/auditor/sop.ejs":"sop",
  "views/auditor/checklist.ejs":"dashboard","views/auditor/temuan.ejs":"dashboard",
};
for (const [f, key] of Object.entries(nav)) {
  const p = path.join(root, f); let s = fs.readFileSync(p, "utf8");
  const from = "include('../partials/header')";
  if (s.includes(from)) { s = s.replace(from, `include('../partials/header', { nav: '${key}' })`); fs.writeFileSync(p, s); console.log("nav", f); }
  else console.log("lewati (sudah/tdk ditemukan)", f);
}
// error.ejs: biarkan; header otomatis memilih layout sesuai peran.
const css = path.join(root, "public/app.css"); let c = fs.readFileSync(css, "utf8");
if (!c.includes(".sprite")) {
  c = c.replace("body.gate { background: var(--canvas); }",
`.sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
.gate-wrap { width: 100%; max-width: 560px; }
.gate-wrap.wide { max-width: 1080px; }
body.gate { background: var(--canvas); }`);
  fs.writeFileSync(css, c); console.log("css diperbarui");
}

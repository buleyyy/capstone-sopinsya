import { redirect } from "next/navigation";
import { apiUrl } from "@/lib/config";

// Admin dan Auditor masuk lewat gerbang bersama yang dilayani Express (apps/api, rute /masuk).
// Web peserta tidak punya login sendiri, jadi /login hanya mengalihkan ke sana.
// Alamat tujuan dibaca dari NEXT_PUBLIC_API_BASE_URL (lihat lib/config.ts), tidak di-hardcode.
export const dynamic = "force-dynamic";

export default function LoginPage(): never {
  redirect(apiUrl("/masuk"));
}

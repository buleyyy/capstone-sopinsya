import type { NextConfig } from "next";

/**
 * Next.js (dev) memblokir permintaan aset /_next/* dari origin selain localhost.
 * Akibatnya, bila halaman dibuka lewat IP jaringan (mis. http://172.20.10.3:3000), JavaScript tidak
 * termuat: halaman tampil tetapi tombol (mis. "Ikuti Pelatihan") tidak merespons.
 * Daftarkan host/IP yang dipakai untuk membuka aplikasi. Tambahan lewat env, pisahkan dengan koma:
 *   NEXT_DEV_ORIGINS=192.168.1.20,laptop-fikri.local
 * Hanya berlaku saat `next dev`; tidak memengaruhi build produksi.
 */
const extraOrigins = (process.env.NEXT_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["172.20.10.*", "192.168.*.*", ...extraOrigins],
};

export default nextConfig;

import type { Metadata } from "next";
import { WHATSAPP_URL } from "@/lib/config";

export const metadata: Metadata = { title: "Tentang Kami - Sopinsya" };

const PLACEHOLDER = "Konten akan diisi oleh penyelenggara.";

export default function TentangKamiPage() {
  return (
    <div className="container about">
      <h1>Tentang Kami</h1>
      <section id="profil">
        <h2>Profil Sopinsya</h2>
        <p className="note">{PLACEHOLDER}</p>
      </section>
      <section id="visi-misi">
        <h2>Visi &amp; Misi</h2>
        <p className="note">{PLACEHOLDER}</p>
      </section>
      <section id="tim">
        <h2>Tim Kami</h2>
        <p className="note">{PLACEHOLDER}</p>
      </section>
      <section id="kontak">
        <h2>Hubungi Kami</h2>
        {WHATSAPP_URL ? (
          <a className="btn btn-primary" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            Konsultasi via WhatsApp
          </a>
        ) : (
          <p className="note">Kontak belum diisi.</p>
        )}
      </section>
    </div>
  );
}

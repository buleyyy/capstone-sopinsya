import type { Metadata } from "next";
import { EmptyState, ErrorState } from "@/components/StateMessage";
import { RoomGrid } from "@/components/RoomCard";
import { fetchApi } from "@/lib/api";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ProgramPelatihan - Sopinsya" };

export default async function RoomsPage() {
  const result = await fetchApi<Room[]>("/api/public/rooms");

  return (
    <>
      <h1>Programpelatihan</h1>
      <p className="note">Pilih Programuntuk melihat materi dan dokumen yang tersedia.</p>
      {result.status === "ok" && result.data.length > 0 && <RoomGrid rooms={result.data} />}
      {result.status === "ok" && result.data.length === 0 && (
        <EmptyState title="Belum ada Programpelatihan">
          Programakan tampil di sini setelah dipublikasikan oleh penyelenggara.
        </EmptyState>
      )}
      {result.status === "not_found" && <ErrorState message="Layanan data belum tersedia." />}
      {result.status === "unavailable" && <ErrorState message={result.message} />}
    </>
  );
}

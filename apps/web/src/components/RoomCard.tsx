import Link from "next/link";
import type { Room } from "@/lib/types";

export function RoomCard({ room }: { room: Room }) {
  return (
    <li className="card room-card">
      <h3>
        <Link href={`/Program/${room.id}`}>{room.name}</Link>
      </h3>
      {room.description ? <p>{room.description}</p> : <p className="note">Belum ada deskripsi.</p>}
      <p className="note">
        {room.documentCount > 0 ? `${room.documentCount} dokumen materi` : "Belum ada dokumen materi"}
      </p>
    </li>
  );
}

export function RoomGrid({ rooms }: { rooms: Room[] }) {
  return (
    <ul className="grid" aria-label="Daftar Programpelatihan">
      {rooms.map((r) => (
        <RoomCard key={r.id} room={r} />
      ))}
    </ul>
  );
}

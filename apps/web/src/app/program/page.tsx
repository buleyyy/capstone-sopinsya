import type { Metadata } from "next";
import { ProgramBrowser } from "@/components/ProgramBrowser";
import { ErrorState } from "@/components/StateMessage";
import { fetchPrograms } from "@/lib/programs";

export const metadata: Metadata = { title: "Program Pelatihan - Sopinsya" };
export const dynamic = "force-dynamic";

export default async function ProgramPage() {
  const result = await fetchPrograms();
  if (result.status !== "ok") {
    return (
      <div className="container section">
        <ErrorState message={result.status === "unavailable" ? result.message : "Daftar program tidak ditemukan."} />
      </div>
    );
  }
  return <ProgramBrowser programs={result.data} />;
}

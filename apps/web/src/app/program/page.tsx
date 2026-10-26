import type { Metadata } from "next";
import { ProgramBrowser } from "@/components/ProgramBrowser";
import { PROGRAMS } from "@/lib/programs";

export const metadata: Metadata = { title: "Program Pelatihan - Sopinsya" };

export default function ProgramPage() {
  return <ProgramBrowser programs={PROGRAMS} />;
}

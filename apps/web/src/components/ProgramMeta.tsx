import { CalendarIcon, PinIcon, UserIcon } from "./Icons";
import type { Program } from "@/lib/programs";

export function ProgramMeta({ program }: { program: Program }) {
  return (
    <ul className="meta">
      <li>
        <CalendarIcon className="meta-icon" /> {program.duration}
      </li>
      <li>
        <PinIcon className="meta-icon" /> {program.mode}
      </li>
      <li>
        <UserIcon className="meta-icon" /> Trainer: {program.trainer}
      </li>
    </ul>
  );
}

import { UserIcon } from "./Icons";
import type { Program } from "@/lib/programs";

export function ProgramMeta({ program }: { program: Program }) {
  return (
    <ul className="meta">
      <li>
        <UserIcon className="meta-icon" /> Trainer: {program.trainer}
      </li>
    </ul>
  );
}

import pc from "picocolors";
import { writeHandoffBundle, printHandoffPrompt } from "../handoff.js";

export interface InstallOptions {
  tool?: string;
  yes?: boolean;
  skipVersionCheck?: boolean;
}

export async function install(opts: InstallOptions): Promise<void> {
  // TODO(spec §5.3): detect agents → run preset adapter OR handoff
  // TODO: write/update ~/.lorejump/install-log.json on success
  if (opts.tool === "handoff") {
    // Stub: skill content will be loaded from src/content/skills/ in next iteration
    await writeHandoffBundle({ skills: {} });
    printHandoffPrompt();
    return;
  }
  console.log(pc.dim("[install] scaffold — not yet implemented"));
  console.log(pc.dim("  see docs/specs/cli-installer/spec.md §5.3"));
}

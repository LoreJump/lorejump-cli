import pc from "picocolors";

export interface UpdateOptions {
  yes?: boolean;
  skipVersionCheck?: boolean;
}

export async function update(_opts: UpdateOptions): Promise<void> {
  // TODO(spec §5.7): three-layer self-update
  //   L1: passive nudge if newer @lorejump/cli on npm (via runVersionNudge in cli.ts)
  //   L2: read ~/.lorejump/install-log.json → for each target, refresh SKILL.md
  //       (hash compare; rewrite on diff, skip on match)
  //   L3: re-merge MCP config (preserve user customizations to lorejump entry URL)
  // Behavior: idempotent; missing install-log → friendly exit; corrupted log → error
  console.log(pc.dim("[update] scaffold — not yet implemented"));
  console.log(pc.dim("  see docs/specs/cli-installer/spec.md §5.7"));
}

import pc from "picocolors";

export interface DoctorOptions {
  skipVersionCheck?: boolean;
}

export async function doctor(_opts: DoctorOptions): Promise<void> {
  // TODO(spec §5.5 #4): infrastructure-layer verification
  //   - SKILL.md files exist + reasonable size
  //   - MCP config schema valid (json/toml)
  //   - MCP endpoint HEAD 200 (timeout 5s)
  //   - existing user mcpServers preserved
  //   - read /tmp/lorejump-handoff/install-log.json if handoff was used
  console.log(pc.dim("[doctor] scaffold — not yet implemented"));
  console.log(pc.dim("  see docs/specs/cli-installer/spec.md §5.5"));
}

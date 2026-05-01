import type { SkillName } from "../constants.js";

export interface McpEntry {
  url: string;
}

export interface AdapterContext {
  cwd: string;
  homedir: string;
}

export interface InstalledTarget {
  agent: string;
  skill_paths: string[];
  skill_hashes: Record<SkillName, string>;
  mcp_config_path: string;
  mcp_entry_name: string;
  preserved_existing: string[];
}

export interface Adapter {
  /** C1-C4 admission criteria hit (one or more), per spec §3.4 */
  readonly admission: ReadonlyArray<"C1" | "C2" | "C3" | "C4">;
  /** Display name shown in TUI */
  readonly displayName: string;
  /** Stable id used for --tool=<name> */
  readonly id: string;

  probe(ctx: AdapterContext): Promise<boolean>;

  installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]>;

  installMcp(
    ctx: AdapterContext,
    name: string,
    entry: McpEntry,
  ): Promise<{ configPath: string; preservedExisting: string[] }>;
}

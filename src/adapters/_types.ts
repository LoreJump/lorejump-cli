import type { SkillName } from "../constants.js";

export interface McpEntry {
  url: string;
}

export interface AdapterContext {
  cwd: string;
  homedir: string;
  /**
   * Install scope. "user" writes to the agent's user-level config (e.g.
   * ~/.claude.json, ~/.cursor/), avoiding project-level trust prompts.
   * "project" writes to <cwd>/.<agent>/. For agents with no project scope
   * (cline, codex, hermes, windsurf MCP), this flag is ignored.
   * Default: "user" (zero friction for solo developers).
   */
  scope?: "user" | "project";
}

export type McpFormat = "json" | "toml" | "yaml";

export interface InstalledTarget {
  agent: string;
  skill_paths: string[];
  skill_hashes: Record<SkillName, string>;
  mcp_config_path: string;
  mcp_entry_name: string;
  /** New in 0.1.0-alpha.1 — optional for backward-compat with older logs */
  mcp_root_key?: string;
  mcp_format?: McpFormat;
  preserved_existing: string[];
  /** Where the install wrote — "user" (~/.<agent>/...) or "project" (<cwd>/.<agent>/...) */
  scope?: "user" | "project";
  /** CLI version recorded at install time (the parent log's cli_version updates on every install/update) */
  cli_version_at_install?: string;
}

export interface Adapter {
  /** C1-C4 admission criteria hit (one or more), per spec §3.4 */
  readonly admission: ReadonlyArray<"C1" | "C2" | "C3" | "C4">;
  /** Display name shown in TUI */
  readonly displayName: string;
  /** Stable id used for --tool=<name> */
  readonly id: string;
  /** Top-level key under which MCP servers are listed (varies by agent — vscode uses "servers", others "mcpServers", codex/hermes "mcp_servers") */
  readonly mcpRootKey: string;
  /** Config file format — JSON for most, TOML for codex, YAML for hermes */
  readonly mcpFormat: McpFormat;

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

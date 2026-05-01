import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";

export const trae: Adapter = {
  id: "trae",
  displayName: "Trae (字节)",
  admission: ["C1", "C2"],

  async probe(ctx: AdapterContext): Promise<boolean> {
    return existsSync(join(ctx.cwd, ".trae"));
  },

  async installSkills(
    _ctx: AdapterContext,
    _skills: Record<SkillName, string>,
  ): Promise<string[]> {
    // C2 schema trap: filename MUST be exactly "SKILL.md" (uppercase),
    // not "skill.md" — Trae is case-sensitive on this even on case-insensitive FS.
    // CI must run on Linux to catch lowercase regressions.
    // TODO: write to .trae/skills/<name>/SKILL.md
    throw new Error("trae installSkills not yet implemented");
  },

  async installMcp(
    _ctx: AdapterContext,
    _name: string,
    _entry: McpEntry,
  ): Promise<{ configPath: string; preservedExisting: string[] }> {
    // TODO: merge into Trae MCP config; root key: mcpServers
    throw new Error("trae installMcp not yet implemented");
  },
};

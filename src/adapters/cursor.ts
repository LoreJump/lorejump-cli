import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";

export const cursor: Adapter = {
  id: "cursor",
  displayName: "Cursor",
  admission: ["C1"],

  async probe(ctx: AdapterContext): Promise<boolean> {
    return existsSync(join(ctx.cwd, ".cursor"));
  },

  async installSkills(
    _ctx: AdapterContext,
    _skills: Record<SkillName, string>,
  ): Promise<string[]> {
    // TODO: write to .cursor/skills/<name>/SKILL.md
    throw new Error("cursor installSkills not yet implemented");
  },

  async installMcp(
    _ctx: AdapterContext,
    _name: string,
    _entry: McpEntry,
  ): Promise<{ configPath: string; preservedExisting: string[] }> {
    // TODO: merge into .cursor/mcp.json
    // root key: mcpServers
    throw new Error("cursor installMcp not yet implemented");
  },
};

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Cursor adapter.
 *
 * Probe:    <cwd>/.cursor/ exists
 * Skill:    .cursor/skills/<name>/SKILL.md (Cursor is converging on SKILL.md)
 * MCP:      .cursor/mcp.json
 * Root key: mcpServers
 */
export const cursor: Adapter = {
  id: "cursor",
  displayName: "Cursor",
  admission: ["C1"],

  async probe(ctx: AdapterContext): Promise<boolean> {
    return existsSync(join(ctx.cwd, ".cursor"));
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      const path = join(ctx.cwd, ".cursor", "skills", name, "SKILL.md");
      await safeWrite(path, skills[name]);
      written.push(path);
    }
    return written;
  },

  async installMcp(
    ctx: AdapterContext,
    name: string,
    entry: McpEntry,
  ): Promise<{ configPath: string; preservedExisting: string[] }> {
    const configPath = join(ctx.cwd, ".cursor", "mcp.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

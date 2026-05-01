import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Trae adapter (字节跳动).
 *
 * C2 schema trap: Trae rejects lowercase `skill.md` even when the host
 * filesystem is case-insensitive. The string literal "SKILL.md" below
 * MUST stay uppercase. CI runs on Linux to catch lowercase regressions
 * (case-sensitive filesystem turns a typo into a hard fail).
 *
 * Probe:    <cwd>/.trae/
 * Skill:    .trae/skills/<name>/SKILL.md  (literal uppercase)
 * MCP:      .trae/mcp.json
 * Root key: mcpServers
 */
export const trae: Adapter = {
  id: "trae",
  displayName: "Trae (字节)",
  admission: ["C1", "C2"],

  async probe(ctx: AdapterContext): Promise<boolean> {
    return existsSync(join(ctx.cwd, ".trae"));
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      // Filename must remain uppercase "SKILL.md" — Trae C2 schema trap.
      const path = join(ctx.cwd, ".trae", "skills", name, "SKILL.md");
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
    const configPath = join(ctx.cwd, ".trae", "mcp.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

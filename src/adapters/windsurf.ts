import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Windsurf (Cognition AI, post-Dec-2025; previously Codeium).
 *
 * No native skill primitive. Uses .windsurf/rules/*.md as equivalent.
 * MCP config is global only (no project-level), at ~/.codeium/windsurf/
 * even though Windsurf is now a Cognition product (vendor dir not renamed
 * as of May 2026; verified via docs.windsurf.com/windsurf/cascade/mcp).
 *
 * C2 detail: Windsurf accepts both legacy `serverUrl` and modern `url` for
 * HTTP entries. We write `url` (modern form, matches Cursor / Claude Code).
 *
 * Probe:    <cwd>/.windsurf/ OR ~/.codeium/windsurf/
 * Skill:    .windsurf/rules/lorejump-<name>.md
 * MCP:      ~/.codeium/windsurf/mcp_config.json   ← global only
 */
export const windsurf: Adapter = {
  id: "windsurf",
  displayName: "Windsurf",
  admission: ["C2"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    if (existsSync(join(ctx.cwd, ".windsurf"))) return true;
    return existsSync(join(ctx.homedir, ".codeium", "windsurf"));
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const dir = join(ctx.cwd, ".windsurf", "rules");
    await mkdir(dir, { recursive: true });
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      const path = join(dir, `${name}.md`);
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
    const configPath = join(
      ctx.homedir,
      ".codeium",
      "windsurf",
      "mcp_config.json",
    );
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

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
 * Scopes (since v1.3+):
 *   - user (default):  ~/.trae/skills/<name>/SKILL.md + ~/.trae/mcp.json
 *   - project:         <cwd>/.trae/skills/<name>/SKILL.md + <cwd>/.trae/mcp.json
 *
 * The user-scope path matches the convention of ~/.trae/user_rules.md +
 * ~/.trae/skills/ documented for Trae v1.3+. Probe accepts either marker.
 *
 * MCP root: mcpServers; HTTP transport: { type: "http", url }.
 */
export const trae: Adapter = {
  id: "trae",
  displayName: "Trae (字节)",
  admission: ["C1", "C2"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".trae")) ||
      existsSync(join(ctx.homedir, ".trae"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const base = pickTraeBase(ctx);
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      // Filename must remain uppercase "SKILL.md" — Trae C2 schema trap.
      const path = join(base, "skills", name, "SKILL.md");
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
    const base = pickTraeBase(ctx);
    const configPath = join(base, "mcp.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      // type:"http" — MCP Streamable HTTP standard; missing type defaults to stdio.
      entryValue: { type: "http", url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

function pickTraeBase(ctx: AdapterContext): string {
  // Default scope is user (~/.trae/) — zero-friction across projects, matches
  // claude-code default. Use --scope=project to target <cwd>/.trae/.
  if (ctx.scope === "project") return join(ctx.cwd, ".trae");
  return join(ctx.homedir, ".trae");
}

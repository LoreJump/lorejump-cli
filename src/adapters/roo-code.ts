import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Roo Code (RooVeterinaryInc.roo-cline) — Cline fork, schema diverged.
 *
 * C2 schema trap: Roo's HTTP MCP entry **requires** `type: "streamable-http"`
 * (per docs.roocode.com/features/mcp/using-mcp-in-roo). Cline's HTTP entry
 * does NOT require type. Reusing Cline's writer here would silently break.
 *
 * Roo also has project-level `.roo/mcp.json` (Cline does not), so we scope
 * the MCP install to the project — preferable to global.
 *
 * Probe:    <cwd>/.roo/ OR <cwd>/.roorules
 * Skill:    .roo/rules/lorejump-<name>.md  (recursive rule loader)
 * MCP:      .roo/mcp.json   ← project-level, Roo-specific
 */
export const rooCode: Adapter = {
  id: "roo-code",
  displayName: "Roo Code (VS Code)",
  admission: ["C2"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".roo")) ||
      existsSync(join(ctx.cwd, ".roorules"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const dir = join(ctx.cwd, ".roo", "rules");
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
    const configPath = join(ctx.cwd, ".roo", "mcp.json");
    // Roo C2: HTTP entries MUST include `type: "streamable-http"`.
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { type: "streamable-http", url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Kimi CLI (Moonshot AI) — Python-based, native skill primitive.
 *
 * Native skill paths (per moonshotai.github.io/kimi-cli/en/customization/skills.html):
 *   user:  ~/.kimi/skills/<name>/SKILL.md (uppercase)
 *   project: .kimi/skills/<name>/SKILL.md (when present)
 * We write both project (if .kimi/ exists) AND user — but since Kimi treats
 * `.kimi/.claude/.codex` as a brand-group MUTEX (silently dedupes), we pick
 * one canonical path: project if .kimi/ exists, else user.
 *
 * MCP: separate JSON file at ~/.kimi/mcp.json (NOT the main config.toml).
 * Schema is plain `mcpServers` — matches Claude Code.
 *
 * Probe:    <cwd>/.kimi/ OR ~/.kimi/
 * Skill:    .kimi/skills/<name>/SKILL.md (project) or ~/.kimi/skills/...
 * MCP:      ~/.kimi/mcp.json  ← global, separate from config.toml
 */
export const kimiCli: Adapter = {
  id: "kimi-cli",
  displayName: "Kimi CLI (Moonshot)",
  admission: ["C1"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".kimi")) ||
      existsSync(join(ctx.homedir, ".kimi"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const baseDir = existsSync(join(ctx.cwd, ".kimi"))
      ? join(ctx.cwd, ".kimi", "skills")
      : join(ctx.homedir, ".kimi", "skills");
    await mkdir(baseDir, { recursive: true });
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      const path = join(baseDir, name, "SKILL.md");
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
    const configPath = join(ctx.homedir, ".kimi", "mcp.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

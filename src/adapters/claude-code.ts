import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Claude Code adapter.
 *
 * Probe order:
 *   1) project: <cwd>/.claude/  → install at project scope
 *   2) user:    ~/.claude/       → fallback to user scope
 *
 * Skill layout:   .claude/skills/<name>/SKILL.md
 * MCP layout:     .mcp.json (project) or ~/.claude.json (user)
 * Root key:       mcpServers
 */
export const claudeCode: Adapter = {
  id: "claude-code",
  displayName: "Claude Code",
  admission: ["C1"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".claude")) ||
      existsSync(join(ctx.homedir, ".claude"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const base = pickClaudeBase(ctx);
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      const content = skills[name];
      const path = join(base, "skills", name, "SKILL.md");
      await safeWrite(path, content);
      written.push(path);
    }
    return written;
  },

  async installMcp(
    ctx: AdapterContext,
    name: string,
    entry: McpEntry,
  ): Promise<{ configPath: string; preservedExisting: string[] }> {
    const base = pickClaudeBase(ctx);
    const configPath =
      base === join(ctx.cwd, ".claude")
        ? join(ctx.cwd, ".mcp.json")
        : join(ctx.homedir, ".claude.json");

    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

function pickClaudeBase(ctx: AdapterContext): string {
  const projectDir = join(ctx.cwd, ".claude");
  if (existsSync(projectDir)) return projectDir;
  return join(ctx.homedir, ".claude");
}

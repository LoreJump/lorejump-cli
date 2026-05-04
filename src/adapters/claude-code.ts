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
 * Default scope: USER (~/.claude/skills/* + ~/.claude.json mcpServers).
 * Project scope (--scope=project) writes <cwd>/.claude/skills/* + <cwd>/.mcp.json,
 * which then requires Claude Code's project-level trust prompt to enable
 * (see ~/.claude.json.projects[cwd].enabledMcpjsonServers). User scope
 * avoids that friction entirely and is the right default for solo developers.
 *
 * Probe (admission detection only — does NOT decide install path):
 *   <cwd>/.claude/ exists OR ~/.claude/ exists
 *
 * Skill layout:   .claude/skills/<name>/SKILL.md
 * MCP layout:     ~/.claude.json (user, default) or .mcp.json (project)
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
    const isProject = ctx.scope === "project";
    const configPath = isProject
      ? join(ctx.cwd, ".mcp.json")
      : join(ctx.homedir, ".claude.json");

    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      // type:"http" required — without it Claude Code defaults to stdio and
      // tries to exec the URL as a command, silently failing.
      entryValue: { type: "http", url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

function pickClaudeBase(ctx: AdapterContext): string {
  // Skill scope follows install scope. Default is user (~/.claude/skills/*).
  if (ctx.scope === "project") return join(ctx.cwd, ".claude");
  return join(ctx.homedir, ".claude");
}

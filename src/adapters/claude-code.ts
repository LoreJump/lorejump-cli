import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";

export const claudeCode: Adapter = {
  id: "claude-code",
  displayName: "Claude Code",
  admission: ["C1"],

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".claude")) ||
      existsSync(join(ctx.homedir, ".claude"))
    );
  },

  async installSkills(
    _ctx: AdapterContext,
    _skills: Record<SkillName, string>,
  ): Promise<string[]> {
    // TODO: write to .claude/skills/<name>/SKILL.md (project-scope)
    // TODO: handle ~/.claude/skills/ (user-scope) when project .claude/ absent
    throw new Error("claude-code installSkills not yet implemented");
  },

  async installMcp(
    _ctx: AdapterContext,
    _name: string,
    _entry: McpEntry,
  ): Promise<{ configPath: string; preservedExisting: string[] }> {
    // TODO: merge into .mcp.json (project) or ~/.claude.json (user)
    // root key: mcpServers
    throw new Error("claude-code installMcp not yet implemented");
  },
};

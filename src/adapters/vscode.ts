import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * VS Code with GitHub Copilot Chat (agent mode + Agent Skills, GA 2026).
 *
 * C2 schema trap #1: MCP root key is **`servers`**, NOT `mcpServers`.
 * Copying a Claude Code or Cursor mcp.json into .vscode/mcp.json silently
 * fails because VS Code's reader looks under `servers`. Verified against
 * code.visualstudio.com/docs/copilot/customization/mcp-servers.
 *
 * C2 schema trap #2: HTTP entry **must** include `type: "http"` (per the
 * same doc). Copying entries that lack `type` would also be silently ignored.
 *
 * Skill: VS Code Agent Skills loads from .github/skills/<n>/SKILL.md
 * (uppercase, frontmatter `name` must match dir name). Verified against
 * code.visualstudio.com/docs/copilot/customization/agent-skills.
 *
 * Probe:    <cwd>/.vscode/ OR <cwd>/.github/ (most VS Code projects have one)
 * Skill:    .github/skills/<name>/SKILL.md  (uppercase)
 * MCP:      .vscode/mcp.json  — root key `servers`, entry `{type:"http", url}`
 */
export const vscode: Adapter = {
  id: "vscode",
  displayName: "VS Code (Copilot Chat)",
  admission: ["C2"],
  mcpRootKey: "servers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".vscode")) ||
      existsSync(join(ctx.cwd, ".github"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    await mkdir(join(ctx.cwd, ".github", "skills"), { recursive: true });
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      // Uppercase SKILL.md required by VS Code's loader.
      const path = join(ctx.cwd, ".github", "skills", name, "SKILL.md");
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
    const configPath = join(ctx.cwd, ".vscode", "mcp.json");
    const result = await mergeJsonEntry({
      path: configPath,
      // VS Code C2: root key is `servers`, NOT `mcpServers`.
      rootKey: "servers",
      entryName: name,
      // VS Code C2: HTTP entry MUST include `type: "http"`.
      entryValue: { type: "http", url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

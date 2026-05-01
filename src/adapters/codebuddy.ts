import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * CodeBuddy (腾讯云 AI 助手) — supports IDE plugin + standalone CLI.
 *
 * Skill system uses plugin-packaged skills (~/.codebuddy/plugins/<p>/skills/...).
 * Authoring a full plugin package is heavy for a one-shot install; we instead
 * ship as sub-agents at .codebuddy/agents/lorejump-<name>.md (sub-agent docs:
 * codebuddy.ai/docs/cli/sub-agents). This is the lightest path that works for
 * both IDE and CLI variants without a plugin manifest.
 *
 * MCP supports both project (.codebuddy/.mcp.json) and user (~/.codebuddy/.mcp.json)
 * — we prefer project-level. Format is JSONC; rootKey is mcpServers.
 *
 * Probe:    <cwd>/.codebuddy/ OR ~/.codebuddy/
 * Agent:    .codebuddy/agents/lorejump-<name>.md
 * MCP:      .codebuddy/.mcp.json   (note: leading dot — distinct from .mcp.json at cwd root)
 */
export const codebuddy: Adapter = {
  id: "codebuddy",
  displayName: "CodeBuddy (腾讯)",
  admission: ["C1"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".codebuddy")) ||
      existsSync(join(ctx.homedir, ".codebuddy"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const dir = join(ctx.cwd, ".codebuddy", "agents");
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
    const configPath = join(ctx.cwd, ".codebuddy", ".mcp.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

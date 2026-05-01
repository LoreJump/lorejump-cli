import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeTomlEntry } from "../utils/toml-merge.js";

/**
 * OpenAI Codex CLI — TOML config, AGENTS.md instruction layer.
 *
 * C2 schema trap (the heaviest of all): Codex's MCP table is
 *   `[mcp_servers.<name>]`
 * — singular `mcp_servers` (snake_case), dotted-key syntax. NOT
 * `[mcp.servers.<name>]`, NOT `[[mcp_servers]]` (array-of-tables), NOT
 * `mcpServers` (camelCase). Verified against
 * github.com/openai/codex/blob/main/docs/config.md.
 *
 * HTTP entry uses `http_headers` (table) and `bearer_token_env_var`,
 * not `headers`. We omit those for the simple URL-only case.
 *
 * Skill: Codex's primary instruction layer is AGENTS.md, but the docs
 * also reference ~/.codex/skills/. We use the latter for consistency
 * with kimi/qwen — Codex resolves both. SKILL.md filename uppercase.
 *
 * Probe:    <cwd>/.codex/ OR ~/.codex/
 * Skill:    ~/.codex/skills/<name>/SKILL.md  (user-level; project-level not standard)
 * MCP:      ~/.codex/config.toml — root key `[mcp_servers.<name>]`
 */
export const codex: Adapter = {
  id: "codex",
  displayName: "Codex CLI (OpenAI)",
  admission: ["C2"],
  mcpRootKey: "mcp_servers",
  mcpFormat: "toml",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".codex")) ||
      existsSync(join(ctx.homedir, ".codex"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const baseDir = join(ctx.homedir, ".codex", "skills");
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
    const configPath = join(ctx.homedir, ".codex", "config.toml");
    const result = await mergeTomlEntry({
      path: configPath,
      // Codex C2: snake_case singular, dotted-key — `[mcp_servers.<name>]`.
      rootKey: "mcp_servers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

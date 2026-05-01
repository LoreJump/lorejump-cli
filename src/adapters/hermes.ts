import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeYamlEntry } from "../utils/yaml-merge.js";

/**
 * Hermes Agent (Nous Research) — YAML config, native skill primitive.
 *
 * C2 schema trap: config is YAML (~/.hermes/config.yaml) with a single
 * top-level `mcp_servers:` key (snake_case). Verified against
 * github.com/NousResearch/hermes-agent. Comments will NOT be preserved
 * through merge (js-yaml has no round-trip comment support); users
 * with hand-comments should back up before running install.
 *
 * Skill: ~/.hermes/skills/<name>/SKILL.md (uppercase, per Hermes docs).
 *
 * Probe:    <cwd>/.hermes/ OR ~/.hermes/
 * Skill:    ~/.hermes/skills/<name>/SKILL.md  (user-level; project-level not documented)
 * MCP:      ~/.hermes/config.yaml — top-level key `mcp_servers:`
 */
export const hermes: Adapter = {
  id: "hermes",
  displayName: "Hermes (Nous Research)",
  admission: ["C2"],
  mcpRootKey: "mcp_servers",
  mcpFormat: "yaml",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".hermes")) ||
      existsSync(join(ctx.homedir, ".hermes"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const baseDir = join(ctx.homedir, ".hermes", "skills");
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
    const configPath = join(ctx.homedir, ".hermes", "config.yaml");
    const result = await mergeYamlEntry({
      path: configPath,
      // Hermes C2: snake_case `mcp_servers:` (NOT `mcpServers`).
      rootKey: "mcp_servers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

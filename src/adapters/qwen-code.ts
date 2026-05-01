import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Qwen Code (Alibaba) — direct fork of google-gemini/gemini-cli.
 *
 * C2 schema trap: HTTP MCP entry uses **`httpUrl`** (NOT `url`) — gemini-cli
 * convention where `url` is reserved for SSE transport, `httpUrl` for
 * Streamable HTTP. Verified against
 * qwenlm.github.io/qwen-code-docs/en/users/features/mcp/. Reusing entries
 * with plain `url` keys would route to SSE handler and fail.
 *
 * Native skill primitive (also gemini-cli inherited): .qwen/skills/<n>/SKILL.md
 * (uppercase), frontmatter requires non-empty `name` + `description`.
 *
 * Probe:    <cwd>/.qwen/ OR ~/.qwen/
 * Skill:    .qwen/skills/<name>/SKILL.md (uppercase)
 * MCP:      ~/.qwen/settings.json  — entry uses `httpUrl`
 */
export const qwenCode: Adapter = {
  id: "qwen-code",
  displayName: "Qwen Code (阿里)",
  admission: ["C2"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".qwen")) ||
      existsSync(join(ctx.homedir, ".qwen"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const baseDir = existsSync(join(ctx.cwd, ".qwen"))
      ? join(ctx.cwd, ".qwen", "skills")
      : join(ctx.homedir, ".qwen", "skills");
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
    const configPath = join(ctx.homedir, ".qwen", "settings.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      // Qwen C2: HTTP transport uses `httpUrl`, NOT `url`.
      entryValue: { httpUrl: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

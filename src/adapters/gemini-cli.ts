import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Google Gemini CLI adapter.
 *
 * C2 schema trap (the same as qwen-code, which is a fork of gemini-cli):
 * HTTP MCP entry uses **`httpUrl`** (NOT `url`). In gemini-cli convention:
 *   - `url`     → SSE transport
 *   - `httpUrl` → Streamable HTTP transport
 * Verified against
 *   github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
 *   geminicli.com/docs/tools/mcp-server/
 *
 * Skill primitive: gemini-cli does not yet ship a native skill loader (as of
 * 2026-W19). We follow the convention emerging in the qwen/gemini ecosystem
 * by writing to ~/.gemini/skills/<name>/SKILL.md (uppercase) — gemini-cli's
 * extension framework will likely surface this directory; if not, the skill
 * is still readable as a markdown file the agent can be pointed at via the
 * GEMINI.md instruction layer (see comment below).
 *
 * Probe:    <cwd>/.gemini/ OR ~/.gemini/
 * Skill:    ~/.gemini/skills/<name>/SKILL.md (user scope; project scope rare)
 * MCP:      ~/.gemini/settings.json — root key `mcpServers`, entry uses `httpUrl`
 *
 * Antigravity is a separate adapter (~/.gemini/antigravity/mcp_config.json),
 * even though it shares the parent .gemini/ directory.
 */
export const geminiCli: Adapter = {
  id: "gemini-cli",
  displayName: "Gemini CLI (Google)",
  admission: ["C2"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    // Antigravity also lives under ~/.gemini/, so we look for its absence as
    // part of disambiguation: if only ~/.gemini/antigravity/ exists (no
    // settings.json sibling), the antigravity adapter should win. We do a
    // lightweight check here — final adapter selection in install.ts respects
    // probe order.
    return (
      existsSync(join(ctx.cwd, ".gemini")) ||
      existsSync(join(ctx.homedir, ".gemini"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const baseDir = join(ctx.homedir, ".gemini", "skills");
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
    const configPath = join(ctx.homedir, ".gemini", "settings.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      // Gemini C2: HTTP transport uses `httpUrl`, NOT `url`.
      entryValue: { httpUrl: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

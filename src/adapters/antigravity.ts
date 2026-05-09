import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { mergeJsonEntry } from "../utils/json-merge.js";
import { mergeFencedSection } from "../utils/fenced-merge.js";

/**
 * Google Antigravity adapter (the agent IDE built on Gemini, launched 2025).
 *
 * Antigravity shares the parent ~/.gemini/ directory with Gemini CLI but
 * has its own subdir for MCP config. Probe order in adapters/index.ts must
 * put antigravity BEFORE gemini-cli so a user with both doesn't get absorbed
 * into the Gemini CLI adapter.
 *
 * Schema specifics (verified against antigravity.google/docs/mcp +
 * github/antigravity install guides, 2026-04):
 *   - MCP config:    ~/.gemini/antigravity/mcp_config.json (macOS/Linux)
 *                    %USERPROFILE%\.gemini\antigravity\mcp_config.json (Windows)
 *   - Root key:      mcpServers
 *   - HTTP transport: not yet documented in official Antigravity MCP docs as of
 *     2026-04-25 (only stdio examples shown); we apply gemini-cli's convention
 *     of `httpUrl` since Antigravity is built on Gemini infrastructure. If this
 *     proves wrong post-launch, fall back to `url` and update this comment.
 *   - Instruction file: AGENTS.md (NOT CLAUDE.md, NOT GEMINI.md). Same standard
 *     as Codex CLI. Antigravity reads <cwd>/AGENTS.md as project-level rules.
 *
 * Skill primitive: Antigravity has no native skill loader (as of 2026-W19).
 * We append the skill content as a fenced block in <cwd>/AGENTS.md so the
 * agent picks it up via its instruction layer. User-edited content above /
 * below the fence is preserved across `lorejump update`.
 *
 * Probe:    ~/.gemini/antigravity/  (Antigravity creates this on first run)
 * Skill:    <cwd>/AGENTS.md  (fenced section per skill name)
 * MCP:      ~/.gemini/antigravity/mcp_config.json — root `mcpServers`, httpUrl
 */
export const antigravity: Adapter = {
  id: "antigravity",
  displayName: "Antigravity (Google)",
  admission: ["C2"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return existsSync(join(ctx.homedir, ".gemini", "antigravity"));
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    // Antigravity has no native skill directory. Append each skill as a fenced
    // section in <cwd>/AGENTS.md, the IDE's official instruction layer.
    const agentsMdPath = join(ctx.cwd, "AGENTS.md");
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      await mergeFencedSection({
        path: agentsMdPath,
        id: `skill:${name}`,
        body: `## LoreJump Skill — \`${name}\`\n\n${skills[name]}`,
      });
    }
    // Report the path once (not per skill — they all live in the same file).
    written.push(agentsMdPath);
    return written;
  },

  async installMcp(
    ctx: AdapterContext,
    name: string,
    entry: McpEntry,
  ): Promise<{ configPath: string; preservedExisting: string[] }> {
    const dir = join(ctx.homedir, ".gemini", "antigravity");
    await mkdir(dir, { recursive: true });
    const configPath = join(dir, "mcp_config.json");
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      // Antigravity (Gemini-derived) — HTTP transport via `httpUrl`. If
      // upstream Antigravity ships docs preferring `url`, swap here.
      entryValue: { httpUrl: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Qoder / QoderWork adapter (阿里巴巴).
 *
 * Qoder ships in three forms — Qoder IDE, qodercli, QoderWork (desktop Agent
 * for non-coders). Per official docs ("无论是在 Qoder IDE 还是 CLI 中，
 * Skills 的使用方式完全一致"), all three share the same ~/.qoder/ root for
 * skills and ~/.qoder.json for MCP servers.
 *
 * Skill primitive: native, mirrors Claude Code's structure (folder + SKILL.md
 * with YAML frontmatter, /skill-name trigger). User scope at
 * ~/.qoder/skills/<n>/SKILL.md, project scope at .qoder/skills/<n>/SKILL.md.
 *
 * C2 schema traps:
 *   - Root key is mcpServers (camelCase) — NOT mcp_servers / qoderServers
 *   - HTTP transport uses `type: "streamable-http"` (with hyphen, lowercase)
 *     — NOT `streamableHttp` (cline style), NOT `streamable_http`,
 *     NOT plain `http` (claude-code style).
 *     Verified against docs.qoder.com/qoderwork/mcp.md.
 *
 * Probe:    <cwd>/.qoder/ OR ~/.qoder/ OR ~/.qoder.json
 * Skill:    ~/.qoder/skills/<n>/SKILL.md (user, default) or .qoder/skills/<n>/SKILL.md
 * MCP:      ~/.qoder.json (user, default) or <cwd>/.mcp.json (project)
 * Root key: mcpServers
 */
export const qoder: Adapter = {
  id: "qoder",
  displayName: "QoderWork (阿里)",
  admission: ["C2"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    return (
      existsSync(join(ctx.cwd, ".qoder")) ||
      existsSync(join(ctx.homedir, ".qoder")) ||
      existsSync(join(ctx.homedir, ".qoder.json"))
    );
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const base = pickQoderBase(ctx);
    const written: string[] = [];
    for (const name of SKILL_NAMES) {
      const path = join(base, "skills", name, "SKILL.md");
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
    const isProject = ctx.scope === "project";
    const configPath = isProject
      ? join(ctx.cwd, ".mcp.json")
      : join(ctx.homedir, ".qoder.json");

    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      // Qoder C2: type is "streamable-http" with hyphen — not "streamableHttp"
      // (cline) and not "http" (claude-code). Schema documented in
      // docs.qoder.com/qoderwork/mcp.md.
      entryValue: { type: "streamable-http", url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

function pickQoderBase(ctx: AdapterContext): string {
  // Skill scope follows install scope. Default is user (~/.qoder/skills/*).
  // QoderWork desktop and Qoder IDE both read ~/.qoder/, per official docs.
  if (ctx.scope === "project") return join(ctx.cwd, ".qoder");
  return join(ctx.homedir, ".qoder");
}

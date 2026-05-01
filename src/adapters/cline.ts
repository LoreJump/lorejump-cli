import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:os";
import type { Adapter, AdapterContext, McpEntry } from "./_types.js";
import type { SkillName } from "../constants.js";
import { SKILL_NAMES } from "../constants.js";
import { safeWrite } from "../utils/fs-safe.js";
import { mergeJsonEntry } from "../utils/json-merge.js";

/**
 * Cline (saoudrizwan.claude-dev) — VS Code extension.
 *
 * No native skill primitive. Uses .clinerules/ directory of markdown files
 * as the equivalent (docs.cline.bot/customization/cline-rules).
 *
 * MCP config is **global only** in extension globalStorage — there's an
 * open issue (#2355) requesting project-level support, not yet shipped.
 * That means we cannot scope the MCP install to a project; we touch the
 * user's global Cline config which affects every workspace they open.
 *
 * Probe:    <cwd>/.clinerules/ (file or dir) OR globalStorage path exists
 * Skill:    <cwd>/.clinerules/lorejump-<name>.md  (rule files, not SKILL.md)
 * MCP:      ~/.../<vscode-globalStorage>/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
 */
function clineMcpPath(homedir: string): string {
  const os = platform();
  if (os === "darwin") {
    return join(
      homedir,
      "Library",
      "Application Support",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    );
  }
  if (os === "win32") {
    const appdata = process.env.APPDATA ?? join(homedir, "AppData", "Roaming");
    return join(
      appdata,
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    );
  }
  return join(
    homedir,
    ".config",
    "Code",
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  );
}

export const cline: Adapter = {
  id: "cline",
  displayName: "Cline (VS Code)",
  admission: ["C1"],
  mcpRootKey: "mcpServers",
  mcpFormat: "json",

  async probe(ctx: AdapterContext): Promise<boolean> {
    if (existsSync(join(ctx.cwd, ".clinerules"))) return true;
    return existsSync(clineMcpPath(ctx.homedir));
  },

  async installSkills(
    ctx: AdapterContext,
    skills: Record<SkillName, string>,
  ): Promise<string[]> {
    const dir = join(ctx.cwd, ".clinerules");
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
    const configPath = clineMcpPath(ctx.homedir);
    const result = await mergeJsonEntry({
      path: configPath,
      rootKey: "mcpServers",
      entryName: name,
      entryValue: { url: entry.url },
    });
    return { configPath, preservedExisting: result.preservedExisting };
  },
};

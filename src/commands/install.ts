import { homedir } from "node:os";
import pc from "picocolors";
import { ADAPTERS, ADAPTERS_BY_ID, type Adapter, type AdapterContext } from "../adapters/index.js";
import { MCP_SERVER_URL } from "../constants.js";
import { SKILL_CONTENT } from "../content/skills.js";
import { writeHandoffBundle, printHandoffPrompt } from "../handoff.js";
import {
  ensureInstallLogDir,
  readInstallLog,
  writeInstallLog,
  type InstallLog,
} from "../install-log.js";
import { sha256 } from "../utils/fs-safe.js";
import { createRequire } from "node:module";

export interface InstallOptions {
  tool?: string;
  yes?: boolean;
  skipVersionCheck?: boolean;
  scope?: "user" | "project";
}

// Bundled to dist/cli.js — package.json lives one level up at runtime.
const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../package.json") as { version: string };

export async function install(opts: InstallOptions): Promise<void> {
  const scope: "user" | "project" = opts.scope ?? "user";
  const ctx: AdapterContext = { cwd: process.cwd(), homedir: homedir(), scope };

  if (opts.tool === "handoff") {
    await runHandoff();
    return;
  }

  let chosen: Adapter | null = null;

  if (opts.tool) {
    chosen = ADAPTERS_BY_ID[opts.tool] ?? null;
    if (!chosen) {
      const known = Object.keys(ADAPTERS_BY_ID).join(", ");
      console.error(pc.red(`✗ Unknown --tool="${opts.tool}". Known: ${known}, handoff`));
      process.exit(2);
    }
  } else {
    const detected: Adapter[] = [];
    for (const a of ADAPTERS) {
      if (await a.probe(ctx)) detected.push(a);
    }
    if (detected.length === 0) {
      await runHandoff();
      return;
    }
    if (detected.length === 1) {
      chosen = detected[0]!;
    } else {
      console.log(pc.yellow(`⚠️  Multiple agents detected: ${detected.map((d) => d.displayName).join(", ")}`));
      console.log(pc.dim(`   Defaulting to first match. Re-run with --tool=<id> to pick another.`));
      chosen = detected[0]!;
    }
  }

  console.log(pc.bold(`📦 Installing LoreJump for ${chosen.displayName} (scope: ${scope})...`));

  const skillPaths = await chosen.installSkills(ctx, SKILL_CONTENT);
  for (const p of skillPaths) console.log(pc.green(`   ✓ skill: ${p}`));

  const mcp = await chosen.installMcp(ctx, "lorejump", { url: MCP_SERVER_URL });
  console.log(pc.green(`   ✓ mcp:   ${mcp.configPath}`));
  if (mcp.preservedExisting.length > 0) {
    console.log(pc.dim(`     (preserved: ${mcp.preservedExisting.join(", ")})`));
  }

  await persistInstallLog({
    agent: chosen.id,
    skillPaths,
    mcpConfigPath: mcp.configPath,
    mcpRootKey: chosen.mcpRootKey,
    mcpFormat: chosen.mcpFormat,
    preservedExisting: mcp.preservedExisting,
    scope,
  });

  console.log("");
  console.log(pc.bold("✅ Done."));
  console.log("");
  printNextSteps(chosen.id, scope, mcp.configPath);
}

function printNextSteps(
  agentId: string,
  scope: "user" | "project",
  configPath: string,
): void {
  console.log(pc.bold("Next steps:"));

  if (agentId === "claude-code") {
    if (scope === "user") {
      console.log("  1. Restart Claude Code (close and reopen). User-scope MCP loads on next launch.");
      console.log("  2. Verify: " + pc.cyan("claude mcp list") + "  — lorejump should appear.");
      console.log("  3. In any project: " + pc.cyan("/lorejump-optimize"));
    } else {
      console.log("  1. Restart Claude Code in this directory.");
      console.log("  2. On startup it will ask " + pc.dim('"Trust .mcp.json from this project?"') + " — accept it.");
      console.log("  3. Verify: " + pc.cyan("claude mcp list") + "  — lorejump should appear.");
      console.log("  4. Run: " + pc.cyan("/lorejump-optimize"));
      console.log("");
      console.log(pc.dim("  Tip: --scope=user installs to ~/.claude.json for all projects"));
      console.log(pc.dim("       and skips the per-project trust prompt."));
    }
  } else if (agentId === "cursor") {
    console.log("  1. Restart Cursor.");
    console.log("  2. Settings → MCP → confirm " + pc.cyan("lorejump") + " is listed and green.");
    console.log("  3. In chat: " + pc.cyan("/lorejump-optimize"));
  } else if (agentId === "vscode") {
    console.log("  1. Reload VS Code (Cmd/Ctrl+Shift+P → 'Developer: Reload Window').");
    console.log("  2. Copilot Chat → enable Agent mode → MCP servers should show " + pc.cyan("lorejump") + ".");
    console.log("  3. " + pc.cyan("@workspace /lorejump-optimize"));
  } else if (agentId === "antigravity") {
    console.log("  1. Restart Antigravity (close and reopen).");
    console.log("  2. Click the " + pc.dim('"…" menu') + " in chat → MCP Servers → confirm " + pc.cyan("lorejump") + " is listed.");
    console.log("  3. The skill content was appended to " + pc.cyan("AGENTS.md") + " in this directory.");
    console.log("  4. Trigger: " + pc.cyan("/lorejump-optimize"));
  } else if (agentId === "gemini-cli") {
    console.log("  1. Restart Gemini CLI (it reads ~/.gemini/settings.json on startup).");
    console.log("  2. Verify in CLI: list MCP servers — " + pc.cyan("lorejump") + " should appear.");
    console.log("  3. Trigger: " + pc.cyan("/lorejump-optimize"));
  } else if (agentId === "qoder") {
    console.log("  1. Restart QoderWork / Qoder IDE / qodercli (it reads ~/.qoder.json on startup).");
    console.log("  2. Verify: " + pc.cyan("qodercli mcp list") + " — lorejump should appear.");
    console.log("  3. In any QoderWork chat: " + pc.cyan("/lorejump-optimize"));
  } else if (agentId === "trae") {
    console.log("  1. Restart Trae IDE (close and reopen the window).");
    console.log("  2. Verify MCP " + pc.cyan("lorejump") + " is listed in Trae's MCP panel.");
    console.log("  3. Trigger: " + pc.cyan("/lorejump-optimize"));
    if (scope === "user") {
      console.log("");
      console.log(pc.dim("  Tip: --scope=project installs to <cwd>/.trae/ (per-project)."));
    } else {
      console.log("");
      console.log(pc.dim("  Tip: --scope=user installs to ~/.trae/ (zero per-project setup)."));
    }
  } else if (agentId === "codex" || agentId === "hermes" || agentId === "kimi-cli") {
    console.log("  1. Restart your agent (it reads MCP config on startup).");
    console.log("  2. Trigger: " + pc.cyan("/lorejump-optimize"));
  } else {
    console.log("  1. Restart your agent so it picks up the new MCP entry.");
    console.log("  2. Trigger: " + pc.cyan("/lorejump-optimize"));
  }
  console.log("");
  console.log(pc.dim("  Verify install:  ") + pc.cyan("lorejump doctor"));
  console.log(pc.dim("  Config path:     " + configPath));
}

async function runHandoff(): Promise<void> {
  await writeHandoffBundle({ skills: SKILL_CONTENT });
  printHandoffPrompt();
}

async function persistInstallLog(args: {
  agent: string;
  skillPaths: string[];
  mcpConfigPath: string;
  mcpRootKey: string;
  mcpFormat: "json" | "toml" | "yaml";
  preservedExisting: string[];
  scope: "user" | "project";
}): Promise<void> {
  await ensureInstallLogDir();
  const now = new Date().toISOString();
  const skillHashes = {
    "lorejump-optimize": sha256(SKILL_CONTENT["lorejump-optimize"]),
    "lorejump-harness": sha256(SKILL_CONTENT["lorejump-harness"]),
  };

  const existing = await readInstallLog();
  const newTarget = {
    agent: args.agent,
    skill_paths: args.skillPaths,
    skill_hashes: skillHashes,
    mcp_config_path: args.mcpConfigPath,
    mcp_entry_name: "lorejump",
    mcp_root_key: args.mcpRootKey,
    mcp_format: args.mcpFormat,
    preserved_existing: args.preservedExisting,
    scope: args.scope,
    cli_version_at_install: CLI_VERSION,
  };

  const log: InstallLog = existing
    ? {
        cli_version: CLI_VERSION,
        first_install_at: existing.first_install_at,
        last_update_at: now,
        targets: [
          ...existing.targets.filter((t) => t.agent !== args.agent),
          newTarget,
        ],
      }
    : {
        cli_version: CLI_VERSION,
        first_install_at: now,
        last_update_at: now,
        targets: [newTarget],
      };

  await writeInstallLog(log);
}

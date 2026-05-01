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
}

// Bundled to dist/cli.js — package.json lives one level up at runtime.
const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../package.json") as { version: string };

export async function install(opts: InstallOptions): Promise<void> {
  const ctx: AdapterContext = { cwd: process.cwd(), homedir: homedir() };

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

  console.log(pc.bold(`📦 Installing LoreJump for ${chosen.displayName}...`));

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
    preservedExisting: mcp.preservedExisting,
  });

  console.log("");
  console.log(pc.bold("✅ Done.") + pc.dim("  Verify: lorejump doctor"));
}

async function runHandoff(): Promise<void> {
  await writeHandoffBundle({ skills: SKILL_CONTENT });
  printHandoffPrompt();
}

async function persistInstallLog(args: {
  agent: string;
  skillPaths: string[];
  mcpConfigPath: string;
  preservedExisting: string[];
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
    preserved_existing: args.preservedExisting,
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

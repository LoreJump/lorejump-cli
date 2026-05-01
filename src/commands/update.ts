import { readFile } from "node:fs/promises";
import pc from "picocolors";
import { parse, type ParseError } from "jsonc-parser";
import { MCP_SERVER_URL, SKILL_NAMES } from "../constants.js";
import { SKILL_CONTENT } from "../content/skills.js";
import { readInstallLog, writeInstallLog, type InstallLog } from "../install-log.js";
import { safeWrite, sha256 } from "../utils/fs-safe.js";
import { createRequire } from "node:module";

export interface UpdateOptions {
  yes?: boolean;
  skipVersionCheck?: boolean;
}

// Bundled to dist/cli.js — package.json lives one level up at runtime.
const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../package.json") as { version: string };

export async function update(_opts: UpdateOptions): Promise<void> {
  console.log(pc.bold("🔄 LoreJump update"));

  const log = await readInstallLog();
  if (!log) {
    console.log(pc.yellow("   No install record at ~/.lorejump/install-log.json"));
    console.log(pc.dim("   Run: lorejump install"));
    return;
  }

  console.log(pc.dim(`   Targets: ${log.targets.map((t) => t.agent).join(", ")}`));
  console.log(pc.dim(`   Logged CLI: ${log.cli_version} → running ${CLI_VERSION}`));
  console.log("");

  if (compareSemver(log.cli_version, CLI_VERSION) > 0) {
    console.log(pc.yellow(`⚠️  install-log was written by a newer CLI (${log.cli_version}); refreshing with current ship content anyway.`));
  }

  const newHashes = {
    "lorejump-optimize": sha256(SKILL_CONTENT["lorejump-optimize"]),
    "lorejump-harness": sha256(SKILL_CONTENT["lorejump-harness"]),
  };

  let totalRewritten = 0;
  let totalSkipped = 0;
  let userUrlPreserved = 0;
  const updatedTargets = [];

  for (const target of log.targets) {
    console.log(pc.bold(`▸ ${target.agent}`));

    for (let i = 0; i < target.skill_paths.length; i++) {
      const skillPath = target.skill_paths[i]!;
      const skillName = SKILL_NAMES[i];
      if (!skillName) continue;
      const newContent = SKILL_CONTENT[skillName];
      const newHash = newHashes[skillName];
      const oldHash = target.skill_hashes[skillName];

      let pathExists = true;
      try {
        await readFile(skillPath);
      } catch {
        pathExists = false;
      }

      if (!pathExists) {
        console.log(pc.yellow(`   ⚠ ${skillPath} — was deleted by user, skipping`));
        continue;
      }

      if (oldHash === newHash) {
        console.log(pc.dim(`   = ${skillPath} — up to date`));
        totalSkipped++;
      } else {
        await safeWrite(skillPath, newContent);
        console.log(pc.green(`   ✓ ${skillPath} — refreshed`));
        totalRewritten++;
      }
    }

    const userPreserved = await checkUserCustomization(target.mcp_config_path);
    if (userPreserved) {
      console.log(
        pc.yellow(
          `   ⚠ ${target.mcp_config_path} — you customized lorejump.url; not overwritten`,
        ),
      );
      userUrlPreserved++;
    } else {
      console.log(pc.dim(`   = ${target.mcp_config_path} — MCP entry up to date`));
    }

    updatedTargets.push({
      ...target,
      skill_hashes: newHashes,
    });
    console.log("");
  }

  const newLog: InstallLog = {
    cli_version: CLI_VERSION,
    first_install_at: log.first_install_at,
    last_update_at: new Date().toISOString(),
    targets: updatedTargets,
  };
  await writeInstallLog(newLog);

  console.log(
    pc.bold(
      `✅ Done. ${totalRewritten} rewritten, ${totalSkipped} unchanged${userUrlPreserved ? `, ${userUrlPreserved} user-customized URL preserved` : ""}.`,
    ),
  );
}

async function checkUserCustomization(configPath: string): Promise<boolean> {
  try {
    const raw = await readFile(configPath, "utf-8");
    const errors: ParseError[] = [];
    const parsed = parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) return false;
    const entry = parsed?.mcpServers?.lorejump;
    if (!entry || typeof entry !== "object") return false;
    return entry.url !== MCP_SERVER_URL;
  } catch {
    return false;
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

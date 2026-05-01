import { Command } from "commander";
import pc from "picocolors";
import { createRequire } from "node:module";
import { install } from "./commands/install.js";
import { doctor } from "./commands/doctor.js";
import { update } from "./commands/update.js";
import { runVersionNudge } from "./version-check.js";

// createRequire resolves relative to the bundled file (dist/cli.js after tsup),
// not src/cli.ts — so `../package.json` lands on lorejump-cli/package.json.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("lorejump")
  .description("LoreJump CLI — install / doctor / update for LoreJump skill+MCP")
  .version(pkg.version, "-v, --version");

program
  .command("install")
  .description("Detect agent and install LoreJump skill+MCP")
  .option("--tool <name>", "Force a specific preset adapter or 'handoff'")
  .option("--yes", "Skip TUI confirmation (non-interactive)")
  .option("--skip-version-check", "Skip L1 latest.json fetch")
  .action(async (opts) => {
    await install(opts);
    await runVersionNudge(pkg.version, opts.skipVersionCheck);
  });

program
  .command("doctor")
  .description("Verify install integrity (paths, schema, MCP endpoint)")
  .option("--skip-version-check", "Skip L1 latest.json fetch")
  .action(async (opts) => {
    await doctor(opts);
    await runVersionNudge(pkg.version, opts.skipVersionCheck);
  });

program
  .command("update")
  .description("Refresh installed SKILL.md to latest CLI-shipped content")
  .option("--yes", "Skip TUI confirmation (non-interactive)")
  .option("--skip-version-check", "Skip L1 latest.json fetch")
  .action(async (opts) => {
    await update(opts);
    await runVersionNudge(pkg.version, opts.skipVersionCheck);
  });

program.showHelpAfterError(true);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(pc.red(`✗ ${err.message}`));
  process.exit(1);
});

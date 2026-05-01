import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pc from "picocolors";
import { HANDOFF_DIR, MCP_SERVER_URL } from "./constants.js";
// @ts-expect-error tsup loads .md as text at build time; tsc treats as module
import HANDOFF_INSTALL_MD from "./content/handoff/INSTALL.md";

const HANDOFF_INSTALL_TEXT: string = HANDOFF_INSTALL_MD as unknown as string;

const PASTE_PROMPT = `Read /tmp/lorejump-handoff/INSTALL.md and finish the LoreJump
installation for the agent runtime you are running in. Detect
your runtime by inspecting local config markers; place the
bundled SKILL.md files + merge the MCP config per the
conventions in that doc; write a JSON receipt to
/tmp/lorejump-handoff/install-log.json.`;

export interface HandoffOptions {
  skills: Record<string, string>;
}

/**
 * Write the handoff bundle to /tmp/lorejump-handoff/.
 *
 * SECURITY (spec §5.5 #9): the contents of INSTALL.md are CLI-shipped fixed text.
 * No user input (cwd name, repo README, env vars, agent self-report) is ever
 * concatenated into the prompt — prevents malicious-repo prompt injection.
 */
export async function writeHandoffBundle(opts: HandoffOptions): Promise<void> {
  await mkdir(HANDOFF_DIR, { recursive: true });
  await mkdir(join(HANDOFF_DIR, "skills"), { recursive: true });

  await writeFile(join(HANDOFF_DIR, "INSTALL.md"), HANDOFF_INSTALL_TEXT, "utf-8");

  for (const [name, content] of Object.entries(opts.skills)) {
    const skillDir = join(HANDOFF_DIR, "skills", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
  }

  const mcpConfigSnippet = JSON.stringify(
    { mcpServers: { lorejump: { url: MCP_SERVER_URL } } },
    null,
    2,
  );
  await writeFile(join(HANDOFF_DIR, "mcp-config.json"), mcpConfigSnippet, "utf-8");
}

export function printHandoffPrompt(): void {
  console.log("");
  console.log(pc.yellow("⚠️  No preset adapter matched. Entering handoff mode."));
  console.log(pc.dim(`   Bundle written to: ${HANDOFF_DIR}`));
  console.log("");
  console.log(pc.bold("Paste the following to your agent:"));
  console.log(pc.dim("─".repeat(60)));
  console.log(PASTE_PROMPT);
  console.log(pc.dim("─".repeat(60)));
  console.log("");
  console.log(pc.dim("After your agent finishes, run: lorejump doctor"));
}

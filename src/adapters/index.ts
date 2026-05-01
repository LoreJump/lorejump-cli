import type { Adapter } from "./_types.js";
import { claudeCode } from "./claude-code.js";
import { cursor } from "./cursor.js";
import { trae } from "./trae.js";
import { vscode } from "./vscode.js";
import { codex } from "./codex.js";
import { qwenCode } from "./qwen-code.js";
import { kimiCli } from "./kimi-cli.js";
import { codebuddy } from "./codebuddy.js";
import { rooCode } from "./roo-code.js";
import { cline } from "./cline.js";
import { windsurf } from "./windsurf.js";
import { hermes } from "./hermes.js";

// Probe order matters: more specific markers come first so a dual-agent
// repo (e.g. .roo/ + .clinerules/ both present) prefers the more specific
// agent. claude-code/cursor/trae are top-tier so they probe first.
export const ADAPTERS: readonly Adapter[] = [
  claudeCode,
  cursor,
  trae,
  vscode,
  rooCode,
  cline,
  windsurf,
  codebuddy,
  qwenCode,
  kimiCli,
  codex,
  hermes,
];

export const ADAPTERS_BY_ID: Record<string, Adapter> = Object.fromEntries(
  ADAPTERS.map((a) => [a.id, a]),
);

export type { Adapter, AdapterContext, McpEntry, InstalledTarget } from "./_types.js";

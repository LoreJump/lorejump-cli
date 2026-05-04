import { stat, readFile } from "node:fs/promises";
import pc from "picocolors";
import { parse, type ParseError } from "jsonc-parser";
import toml from "@iarna/toml";
import yaml from "js-yaml";
import { MCP_SERVER_URL } from "../constants.js";
import { readInstallLog, type InstallLog } from "../install-log.js";
import type { InstalledTarget, McpFormat } from "../adapters/_types.js";
import { mcpHandshake } from "../utils/mcp-handshake.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../package.json") as { version: string };

const DOCTOR_SCHEMA_VERSION = "lorejump-doctor-v1";

export interface DoctorOptions {
  skipVersionCheck?: boolean;
  json?: boolean;
}

/**
 * IDE-specific official documentation URLs for agent self-help. Used in the
 * agent_handoff block — when doctor's local checks aren't enough, the agent
 * is expected to WebFetch these and find IDE-specific solutions.
 *
 * Keep these stable + verified. SOTA pipeline tracks IDE docs and refreshes.
 */
const IDE_OFFICIAL_DOCS: Record<string, string[]> = {
  "claude-code": [
    "https://code.claude.com/docs/en/debug-your-config",
    "https://code.claude.com/docs/en/mcp",
    "https://code.claude.com/docs/en/troubleshooting",
  ],
  cursor: [
    "https://docs.cursor.com/context/model-context-protocol",
  ],
  vscode: [
    "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
    "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
  ],
  trae: [
    "https://docs.trae.ai/ide/model-context-protocol",
  ],
  codebuddy: [
    "https://codebuddy.ai/docs/cli/mcp-servers",
  ],
  "kimi-cli": [
    "https://moonshotai.github.io/kimi-cli/en/customization/mcp.html",
  ],
  "qwen-code": [
    "https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/",
  ],
  codex: [
    "https://github.com/openai/codex/blob/main/docs/config.md",
  ],
  hermes: [
    "https://github.com/NousResearch/hermes-agent",
  ],
  windsurf: [
    "https://docs.windsurf.com/windsurf/cascade/mcp",
  ],
  cline: [
    "https://docs.cline.bot/mcp/configuring-mcp-servers",
  ],
  "roo-code": [
    "https://docs.roocode.com/features/mcp/using-mcp-in-roo",
  ],
};

const LOREJUMP_SELF_DOCS = [
  "https://lorejump.com/docs/troubleshooting",
  "https://lorejump.com/docs/mcp",
];

interface CheckResult {
  id: string;
  ok: boolean;
  label: string;
  detail?: string;
  /** Structured observation for --json mode. Free-form per check id. */
  observation?: Record<string, unknown>;
  /** Candidate explanations (unordered) for failure mode. Agent ranks. */
  hypothesis?: string[];
}

export async function doctor(opts: DoctorOptions): Promise<void> {
  const log = await readInstallLog();
  const checks: CheckResult[] = [];
  const targetsForJson: { agent: string; scope?: string }[] = [];

  if (!log) {
    if (opts.json) {
      console.log(JSON.stringify(buildJsonReport([], targetsForJson, null), null, 2));
      return;
    }
    console.log(pc.bold("🔍 LoreJump doctor"));
    console.log(pc.yellow("   No install record at ~/.lorejump/install-log.json"));
    console.log(pc.dim("   Run: lorejump install"));
    return;
  }

  if (!opts.json) {
    console.log(pc.bold("🔍 LoreJump doctor"));
    console.log(
      pc.dim(`   Log version: ${log.cli_version} (last update ${log.last_update_at})`),
    );
    console.log("");
  }

  for (const target of log.targets) {
    targetsForJson.push({ agent: target.agent, scope: target.scope });
    if (!opts.json) {
      const scopeLabel = target.scope ? ` [${target.scope}]` : "";
      console.log(pc.bold(`▸ ${target.agent}${scopeLabel}`));
    }

    for (const p of target.skill_paths) {
      const r = await checkFileExists(p, "skill");
      checks.push(r);
      if (!opts.json) printCheck(r);
    }

    const mcpCheck = await checkMcpConfig(target);
    checks.push(mcpCheck);
    if (!opts.json) printCheck(mcpCheck);

    if (!opts.json) console.log("");
  }

  if (!opts.json) console.log(pc.bold("▸ MCP endpoint"));
  const healthCheck = await checkHealth();
  checks.push(healthCheck);
  if (!opts.json) printCheck(healthCheck);

  const handshakeCheck = await checkHandshake();
  checks.push(handshakeCheck);
  if (!opts.json) printCheck(handshakeCheck);

  const failed = checks.filter((c) => !c.ok).length;

  if (opts.json) {
    console.log(JSON.stringify(buildJsonReport(checks, targetsForJson, log), null, 2));
    if (failed > 0) process.exitCode = 1;
    return;
  }

  console.log("");
  if (failed === 0) {
    console.log(pc.green(pc.bold(`✅ All ${checks.length} checks passed.`)));
  } else {
    console.log(pc.red(pc.bold(`✗ ${failed} of ${checks.length} checks failed.`)));
    console.log("");
    console.log(pc.dim("For agent-driven repair (recommended):"));
    console.log(pc.cyan("  lorejump doctor --json | <pipe to your AI agent>"));
    console.log(pc.dim("Or read the diagnostic decision tree in:"));
    console.log(pc.cyan("  .claude/skills/lorejump-optimize/SKILL.md  (Step 2 error card)"));
    process.exitCode = 1;
  }
}

function printCheck(r: CheckResult): void {
  const icon = r.ok ? pc.green("  ✓") : pc.red("  ✗");
  const detail = r.detail ? pc.dim(` — ${r.detail}`) : "";
  console.log(`${icon} ${r.label}${detail}`);
}

async function checkFileExists(path: string, kind: string): Promise<CheckResult> {
  try {
    const s = await stat(path);
    if (!s.isFile()) {
      return { id: `${kind}_file`, ok: false, label: `${kind}: ${path}`, detail: "not a file", observation: { path, kind } };
    }
    if (s.size < 50) {
      return {
        id: `${kind}_file`,
        ok: false,
        label: `${kind}: ${path}`,
        detail: `suspiciously small (${s.size}B)`,
        observation: { path, kind, size_bytes: s.size },
        hypothesis: ["partial_write", "corrupted_install"],
      };
    }
    return { id: `${kind}_file`, ok: true, label: `${kind}: ${path}`, detail: `${s.size}B`, observation: { path, kind, size_bytes: s.size } };
  } catch {
    return {
      id: `${kind}_file`,
      ok: false,
      label: `${kind}: ${path}`,
      detail: "missing",
      observation: { path, kind, exists: false },
      hypothesis: ["never_installed", "user_deleted_after_install", "wrong_install_scope"],
    };
  }
}

/**
 * Weak-assertion MCP config check. Validates structural shape only:
 *   - file parses
 *   - root key exists
 *   - lorejump entry exists
 *   - entry has SOMETHING that looks like a transport (url / httpUrl / command)
 *
 * Does NOT validate IDE-specific schema details (type field values, etc).
 * That knowledge lives in SKILL.md + IDE official docs — agent-side decision.
 *
 * Outputs `observation` with the entry's actual keys + values for the agent
 * to inspect.
 */
async function checkMcpConfig(target: InstalledTarget): Promise<CheckResult> {
  const path = target.mcp_config_path;
  const rootKey = target.mcp_root_key ?? "mcpServers";
  const format = target.mcp_format ?? "json";

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return {
      id: "mcp_config",
      ok: false,
      label: `mcp config: ${path}`,
      detail: "missing",
      observation: { path, exists: false, format, root_key: rootKey },
      hypothesis: ["never_installed", "user_deleted_after_install", "wrong_install_scope"],
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseMcpConfig(raw, format);
  } catch (err) {
    return {
      id: "mcp_config",
      ok: false,
      label: `mcp config: ${path}`,
      detail: `invalid ${format.toUpperCase()}: ${(err as Error).message}`,
      observation: { path, parse_error: (err as Error).message, format, root_key: rootKey },
      hypothesis: ["user_hand_edit_corrupted", "format_drifted_during_merge"],
    };
  }

  const servers = (parsed?.[rootKey] ?? {}) as Record<string, unknown>;
  if (!("lorejump" in servers)) {
    const presentKeys = Object.keys(parsed ?? {});
    return {
      id: "mcp_config",
      ok: false,
      label: `mcp config: ${path}`,
      detail: `lorejump entry missing under "${rootKey}" key`,
      observation: {
        path,
        root_key_used: rootKey,
        root_keys_present: presentKeys,
        servers_present: Object.keys(servers),
      },
      hypothesis: ["wrong_root_key", "user_removed_entry", "ide_changed_root_key_convention"],
    };
  }

  const lorejumpEntry = servers["lorejump"] as Record<string, unknown> | undefined;
  const preservedLost = target.preserved_existing.filter((n) => !(n in servers));

  // Weak transport-hint check: the entry should have at least one of
  // { url, httpUrl, command }. We don't validate which one is correct for
  // this IDE — that's IDE-specific knowledge in SKILL.md / official docs.
  const hasUrl = lorejumpEntry && "url" in lorejumpEntry;
  const hasHttpUrl = lorejumpEntry && "httpUrl" in lorejumpEntry;
  const hasCommand = lorejumpEntry && "command" in lorejumpEntry;
  const hasTransportHint = Boolean(hasUrl || hasHttpUrl || hasCommand);

  if (!hasTransportHint) {
    return {
      id: "mcp_config",
      ok: false,
      label: `mcp config: ${path}`,
      detail: "lorejump entry has no transport hint (url / httpUrl / command)",
      observation: {
        path,
        entry_keys: lorejumpEntry ? Object.keys(lorejumpEntry) : [],
        entry: lorejumpEntry,
      },
      hypothesis: ["empty_entry", "schema_drift", "merge_bug"],
    };
  }

  if (preservedLost.length > 0) {
    return {
      id: "mcp_config",
      ok: false,
      label: `mcp config: ${path}`,
      detail: `lost preserved entries: ${preservedLost.join(", ")}`,
      observation: {
        path,
        entry: lorejumpEntry,
        preserved_lost: preservedLost,
        preserved_at_install: target.preserved_existing,
      },
      hypothesis: ["user_removed_preserved", "merge_bug", "concurrent_edit"],
    };
  }

  return {
    id: "mcp_config",
    ok: true,
    label: `mcp config: ${path}`,
    detail:
      target.preserved_existing.length > 0
        ? `lorejump + ${target.preserved_existing.length} preserved (${format})`
        : `lorejump entry present (${format})`,
    observation: {
      path,
      format,
      root_key: rootKey,
      entry: lorejumpEntry,
      transport_hint: hasUrl ? "url" : hasHttpUrl ? "httpUrl" : "command",
    },
  };
}

function parseMcpConfig(raw: string, format: McpFormat): Record<string, unknown> {
  if (format === "json") {
    const errors: ParseError[] = [];
    const parsed = parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) throw new Error(`${errors.length} parse error(s)`);
    return (parsed ?? {}) as Record<string, unknown>;
  }
  if (format === "toml") {
    return toml.parse(raw) as Record<string, unknown>;
  }
  const loaded = yaml.load(raw);
  if (!loaded || typeof loaded !== "object") return {};
  return loaded as Record<string, unknown>;
}

async function checkHealth(): Promise<CheckResult> {
  const healthUrl = MCP_SERVER_URL.replace(/\/mcp$/, "/health");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  const t0 = Date.now();
  try {
    const res = await fetch(healthUrl, { method: "GET", signal: ctrl.signal });
    const ms = Date.now() - t0;
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { name?: string; version?: string };
      return {
        id: "endpoint_health",
        ok: true,
        label: `endpoint: ${healthUrl}`,
        detail: `${body.name ?? "?"} v${body.version ?? "?"} in ${ms}ms`,
        observation: { url: healthUrl, server: body, latency_ms: ms },
      };
    }
    if (res.status === 404) return checkEndpointHead();
    return {
      id: "endpoint_health",
      ok: false,
      label: `endpoint: ${healthUrl}`,
      detail: `HTTP ${res.status}`,
      observation: { url: healthUrl, http_status: res.status },
      hypothesis: ["server_outage", "endpoint_path_changed"],
    };
  } catch (err) {
    return {
      id: "endpoint_health",
      ok: false,
      label: `endpoint: ${healthUrl}`,
      detail: (err as Error).name === "AbortError" ? "timeout" : (err as Error).message,
      observation: { url: healthUrl, error: (err as Error).message },
      hypothesis: ["network_unreachable", "dns_failure", "server_outage"],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkEndpointHead(): Promise<CheckResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  const t0 = Date.now();
  try {
    const res = await fetch(MCP_SERVER_URL, { method: "HEAD", signal: ctrl.signal });
    const ms = Date.now() - t0;
    if (res.status >= 500) {
      return {
        id: "endpoint_health",
        ok: false,
        label: `endpoint: ${MCP_SERVER_URL}`,
        detail: `HTTP ${res.status}`,
        observation: { url: MCP_SERVER_URL, http_status: res.status, mode: "fallback_head" },
        hypothesis: ["server_outage"],
      };
    }
    return {
      id: "endpoint_health",
      ok: true,
      label: `endpoint: ${MCP_SERVER_URL}`,
      detail: `HTTP ${res.status} in ${ms}ms (fallback HEAD; /health not deployed)`,
      observation: { url: MCP_SERVER_URL, http_status: res.status, latency_ms: ms, mode: "fallback_head" },
    };
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
    return {
      id: "endpoint_health",
      ok: false,
      label: `endpoint: ${MCP_SERVER_URL}`,
      detail: reason,
      observation: { url: MCP_SERVER_URL, error: reason, mode: "fallback_head" },
      hypothesis: ["network_unreachable", "server_outage"],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHandshake(): Promise<CheckResult> {
  const r = await mcpHandshake(MCP_SERVER_URL);
  if (r.ok) {
    return {
      id: "mcp_handshake",
      ok: true,
      label: "mcp handshake: initialize + tools/list",
      detail: r.detail,
      observation: { server: r.serverInfo, tools: r.tools },
    };
  }
  return {
    id: "mcp_handshake",
    ok: false,
    label: "mcp handshake: initialize + tools/list",
    detail: r.detail,
    observation: { server: r.serverInfo, tools: r.tools, error: r.detail },
    hypothesis: [
      "client_did_not_load_config",
      "client_loaded_config_but_transport_field_wrong",
      "client_cached_old_config_needs_restart",
      "ide_specific_trust_prompt_not_accepted",
      "server_protocol_drift",
    ],
  };
}

interface JsonReport {
  schema: string;
  cli_version: string;
  generated_at: string;
  install_log_present: boolean;
  install_log?: { cli_version: string; last_update_at: string; targets: { agent: string; scope?: string }[] };
  checks: Array<{
    id: string;
    status: "ok" | "fail";
    label: string;
    detail?: string;
    observation?: Record<string, unknown>;
    hypothesis?: string[];
  }>;
  agent_handoff: {
    summary: string;
    failed_check_ids: string[];
    skill_path: string;
    skill_section: string;
    ide_official_docs_for_handoff: string[];
    lorejump_self_docs: string[];
    next_step: string;
  };
}

function buildJsonReport(
  checks: CheckResult[],
  targets: { agent: string; scope?: string }[],
  log: InstallLog | null,
): JsonReport {
  const failed = checks.filter((c) => !c.ok);
  const docsUrls = new Set<string>();
  for (const t of targets) {
    for (const u of IDE_OFFICIAL_DOCS[t.agent] ?? []) docsUrls.add(u);
  }

  return {
    schema: DOCTOR_SCHEMA_VERSION,
    cli_version: CLI_VERSION,
    generated_at: new Date().toISOString(),
    install_log_present: log !== null,
    install_log: log
      ? {
          cli_version: log.cli_version,
          last_update_at: log.last_update_at,
          targets,
        }
      : undefined,
    checks: checks.map((c) => ({
      id: c.id,
      status: c.ok ? "ok" : "fail",
      label: c.label,
      detail: c.detail,
      observation: c.observation,
      hypothesis: c.hypothesis,
    })),
    agent_handoff: {
      summary:
        failed.length === 0
          ? "All checks passed. lorejump-mcp is reachable and exposes expected tools."
          : `${failed.length} of ${checks.length} checks failed. See checks[].observation + hypothesis. Decide repair from SKILL.md decision tree first; fall back to ide_official_docs_for_handoff for schema-drift cases.`,
      failed_check_ids: failed.map((c) => c.id),
      skill_path: ".claude/skills/lorejump-optimize/SKILL.md",
      skill_section: "诊断决策树",
      ide_official_docs_for_handoff: Array.from(docsUrls),
      lorejump_self_docs: LOREJUMP_SELF_DOCS,
      next_step:
        failed.length === 0
          ? "no_action_needed"
          : "read_skill_decision_tree_then_propose_edit_with_user_approval",
    },
  };
}

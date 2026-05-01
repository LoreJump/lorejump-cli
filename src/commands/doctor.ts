import { stat, readFile } from "node:fs/promises";
import pc from "picocolors";
import { parse, type ParseError } from "jsonc-parser";
import { MCP_SERVER_URL } from "../constants.js";
import { readInstallLog } from "../install-log.js";

export interface DoctorOptions {
  skipVersionCheck?: boolean;
}

interface CheckResult {
  ok: boolean;
  label: string;
  detail?: string;
}

export async function doctor(_opts: DoctorOptions): Promise<void> {
  console.log(pc.bold("🔍 LoreJump doctor"));

  const log = await readInstallLog();
  if (!log) {
    console.log(pc.yellow("   No install record at ~/.lorejump/install-log.json"));
    console.log(pc.dim("   Run: lorejump install"));
    return;
  }

  console.log(pc.dim(`   Log version: ${log.cli_version} (last update ${log.last_update_at})`));
  console.log("");

  const all: CheckResult[] = [];
  for (const target of log.targets) {
    console.log(pc.bold(`▸ ${target.agent}`));
    for (const p of target.skill_paths) {
      all.push(printCheck(await checkFileExists(p, "skill")));
    }
    all.push(printCheck(await checkMcpConfig(target.mcp_config_path, target.preserved_existing)));
    console.log("");
  }

  console.log(pc.bold("▸ MCP endpoint"));
  all.push(printCheck(await checkMcpEndpoint()));
  console.log("");

  const failed = all.filter((c) => !c.ok).length;
  if (failed === 0) {
    console.log(pc.green(pc.bold(`✅ All ${all.length} checks passed.`)));
  } else {
    console.log(pc.red(pc.bold(`✗ ${failed} of ${all.length} checks failed.`)));
    console.log(pc.dim("   Fix the items above, or rerun: lorejump install --tool=<known>"));
    process.exitCode = 1;
  }
}

function printCheck(r: CheckResult): CheckResult {
  const icon = r.ok ? pc.green("  ✓") : pc.red("  ✗");
  const detail = r.detail ? pc.dim(` — ${r.detail}`) : "";
  console.log(`${icon} ${r.label}${detail}`);
  return r;
}

async function checkFileExists(path: string, kind: string): Promise<CheckResult> {
  try {
    const s = await stat(path);
    if (!s.isFile()) {
      return { ok: false, label: `${kind}: ${path}`, detail: "not a file" };
    }
    if (s.size < 50) {
      return { ok: false, label: `${kind}: ${path}`, detail: `suspiciously small (${s.size}B)` };
    }
    return { ok: true, label: `${kind}: ${path}`, detail: `${s.size}B` };
  } catch {
    return { ok: false, label: `${kind}: ${path}`, detail: "missing" };
  }
}

async function checkMcpConfig(
  path: string,
  preservedExisting: string[],
): Promise<CheckResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return { ok: false, label: `mcp config: ${path}`, detail: "missing" };
  }
  const errors: ParseError[] = [];
  const parsed = parse(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    return { ok: false, label: `mcp config: ${path}`, detail: "invalid JSON" };
  }
  const servers = (parsed?.mcpServers ?? {}) as Record<string, unknown>;
  if (!("lorejump" in servers)) {
    return { ok: false, label: `mcp config: ${path}`, detail: "lorejump entry missing" };
  }
  const stillThere = preservedExisting.filter((n) => n in servers);
  if (stillThere.length !== preservedExisting.length) {
    const lost = preservedExisting.filter((n) => !(n in servers));
    return {
      ok: false,
      label: `mcp config: ${path}`,
      detail: `lost preserved entries: ${lost.join(", ")}`,
    };
  }
  return {
    ok: true,
    label: `mcp config: ${path}`,
    detail:
      preservedExisting.length > 0
        ? `lorejump + ${preservedExisting.length} preserved`
        : `lorejump entry present`,
  };
}

async function checkMcpEndpoint(): Promise<CheckResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  const t0 = Date.now();
  try {
    const res = await fetch(MCP_SERVER_URL, { method: "HEAD", signal: ctrl.signal });
    const ms = Date.now() - t0;
    // CORS preflight on /mcp returns 405 for HEAD on some MCP servers; treat any
    // 2xx-4xx as "endpoint is alive". 5xx and network errors are real failures.
    if (res.status >= 500) {
      return { ok: false, label: `endpoint: ${MCP_SERVER_URL}`, detail: `HTTP ${res.status}` };
    }
    return { ok: true, label: `endpoint: ${MCP_SERVER_URL}`, detail: `HTTP ${res.status} in ${ms}ms` };
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
    return { ok: false, label: `endpoint: ${MCP_SERVER_URL}`, detail: reason };
  } finally {
    clearTimeout(timer);
  }
}

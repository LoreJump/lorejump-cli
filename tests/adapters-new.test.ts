import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import toml from "@iarna/toml";

import { cline } from "../src/adapters/cline.js";
import { rooCode } from "../src/adapters/roo-code.js";
import { windsurf } from "../src/adapters/windsurf.js";
import { codebuddy } from "../src/adapters/codebuddy.js";
import { vscode } from "../src/adapters/vscode.js";
import { kimiCli } from "../src/adapters/kimi-cli.js";
import { qwenCode } from "../src/adapters/qwen-code.js";
import { geminiCli } from "../src/adapters/gemini-cli.js";
import { antigravity } from "../src/adapters/antigravity.js";
import { trae } from "../src/adapters/trae.js";
import { codex } from "../src/adapters/codex.js";
import { hermes } from "../src/adapters/hermes.js";
import { mergeTomlEntry } from "../src/utils/toml-merge.js";
import { mergeYamlEntry } from "../src/utils/yaml-merge.js";

const FAKE_SKILLS = {
  "lorejump-optimize":
    "# optimize skill\n\n50 bytes minimum content blah blah blah blah\n",
  "lorejump-harness":
    "# harness skill\n\n50 bytes minimum content blah blah blah blah\n",
};

const MCP_URL = "https://mcp.lorejump.com/mcp";

let tmp: string;
let fakeHome: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "lorejump-test-"));
  fakeHome = await mkdtemp(join(tmpdir(), "lorejump-home-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
  await rm(fakeHome, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// cline — global MCP, .clinerules/ rule files
// ─────────────────────────────────────────────────────────────────────────
describe("cline adapter", () => {
  it("probes via project .clinerules/", async () => {
    await mkdir(join(tmp, ".clinerules"), { recursive: true });
    expect(await cline.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes skills as .clinerules/<name>.md (not SKILL.md)", async () => {
    await mkdir(join(tmp, ".clinerules"), { recursive: true });
    const paths = await cline.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect(p).toMatch(/\/\.clinerules\/lorejump-(optimize|harness)\.md$/);
      expect(existsSync(p)).toBe(true);
    }
  });

  it("writes MCP to global cline_mcp_settings.json with type:streamableHttp", async () => {
    const result = await cline.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toContain("cline_mcp_settings.json");
    expect(result.configPath).toContain("saoudrizwan.claude-dev");
    expect(result.configPath).toContain(fakeHome); // global, in homedir
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.type).toBe("streamableHttp"); // Cline-specific field name
  });
});

// ─────────────────────────────────────────────────────────────────────────
// roo-code — project-level MCP, HTTP requires `type: "streamable-http"`
// ─────────────────────────────────────────────────────────────────────────
describe("roo-code adapter (C2: streamable-http type required)", () => {
  it("probes via .roo/", async () => {
    await mkdir(join(tmp, ".roo"), { recursive: true });
    expect(await rooCode.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("probes via legacy .roorules file", async () => {
    await writeFile(join(tmp, ".roorules"), "rule content");
    expect(await rooCode.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes skills under .roo/rules/", async () => {
    const paths = await rooCode.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    expect(paths.every((p) => p.includes("/.roo/rules/"))).toBe(true);
  });

  it("MCP entry MUST include type: 'streamable-http'", async () => {
    const result = await rooCode.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toMatch(/\/\.roo\/mcp\.json$/);
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.type).toBe("streamable-http");
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// windsurf — global only, .codeium/windsurf/ vendor dir not renamed
// ─────────────────────────────────────────────────────────────────────────
describe("windsurf adapter", () => {
  it("probes via project .windsurf/", async () => {
    await mkdir(join(tmp, ".windsurf"), { recursive: true });
    expect(await windsurf.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("probes via user ~/.codeium/windsurf/", async () => {
    await mkdir(join(fakeHome, ".codeium", "windsurf"), { recursive: true });
    expect(await windsurf.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes skills under .windsurf/rules/", async () => {
    const paths = await windsurf.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    expect(paths.every((p) => p.includes("/.windsurf/rules/"))).toBe(true);
  });

  it("writes MCP to ~/.codeium/windsurf/mcp_config.json with type:http", async () => {
    const result = await windsurf.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toBe(
      join(fakeHome, ".codeium", "windsurf", "mcp_config.json"),
    );
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.type).toBe("http");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// codebuddy — .codebuddy/agents/ + .codebuddy/.mcp.json
// ─────────────────────────────────────────────────────────────────────────
describe("codebuddy adapter", () => {
  it("probes via .codebuddy/", async () => {
    await mkdir(join(tmp, ".codebuddy"), { recursive: true });
    expect(await codebuddy.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes agents under .codebuddy/agents/", async () => {
    const paths = await codebuddy.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    expect(paths.every((p) => p.includes("/.codebuddy/agents/"))).toBe(true);
  });

  it("writes MCP to .codebuddy/.mcp.json with type:http", async () => {
    const result = await codebuddy.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toMatch(/\/\.codebuddy\/\.mcp\.json$/);
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.type).toBe("http");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// vscode — root key `servers` (NOT mcpServers), HTTP entry needs type
// ─────────────────────────────────────────────────────────────────────────
describe("vscode adapter (C2: servers root + type field)", () => {
  it("probes via .vscode/ or .github/", async () => {
    await mkdir(join(tmp, ".vscode"), { recursive: true });
    expect(await vscode.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes skills under .github/skills/<name>/SKILL.md (uppercase)", async () => {
    const paths = await vscode.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    for (const p of paths) {
      expect(p.endsWith("/SKILL.md")).toBe(true);
      expect(p).toMatch(/\/\.github\/skills\/lorejump-(optimize|harness)\/SKILL\.md$/);
    }
  });

  it("MCP root key MUST be 'servers' not 'mcpServers'", async () => {
    const result = await vscode.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toMatch(/\/\.vscode\/mcp\.json$/);
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.servers).toBeDefined();
    expect(after.mcpServers).toBeUndefined();
    expect(after.servers.lorejump.type).toBe("http");
    expect(after.servers.lorejump.url).toBe(MCP_URL);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// kimi-cli — separate ~/.kimi/mcp.json file
// ─────────────────────────────────────────────────────────────────────────
describe("kimi-cli adapter", () => {
  it("probes via ~/.kimi/", async () => {
    await mkdir(join(fakeHome, ".kimi"), { recursive: true });
    expect(await kimiCli.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes skills as SKILL.md (uppercase)", async () => {
    const paths = await kimiCli.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    for (const p of paths) {
      expect(p.endsWith("/SKILL.md")).toBe(true);
      expect(p).toMatch(/\/skills\/lorejump-(optimize|harness)\/SKILL\.md$/);
    }
  });

  it("MCP path is ~/.kimi/mcp.json (separate from config.toml) with type:http", async () => {
    const result = await kimiCli.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toBe(join(fakeHome, ".kimi", "mcp.json"));
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.type).toBe("http");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// qwen-code — HTTP MCP entry uses `httpUrl` NOT `url` (gemini-cli derived)
// ─────────────────────────────────────────────────────────────────────────
describe("qwen-code adapter (C2: httpUrl not url)", () => {
  it("probes via ~/.qwen/", async () => {
    await mkdir(join(fakeHome, ".qwen"), { recursive: true });
    expect(await qwenCode.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("MCP entry uses 'httpUrl' field (NOT 'url')", async () => {
    const result = await qwenCode.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toBe(join(fakeHome, ".qwen", "settings.json"));
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.httpUrl).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.url).toBeUndefined(); // url=SSE; we want httpUrl=Streamable HTTP
  });
});

// ─────────────────────────────────────────────────────────────────────────
// codex — TOML config, [mcp_servers.<name>]
// ─────────────────────────────────────────────────────────────────────────
describe("codex adapter (C2: TOML mcp_servers snake_case)", () => {
  it("probes via ~/.codex/", async () => {
    await mkdir(join(fakeHome, ".codex"), { recursive: true });
    expect(await codex.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("MCP path is ~/.codex/config.toml", async () => {
    const result = await codex.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toBe(join(fakeHome, ".codex", "config.toml"));
    const raw = await readFile(result.configPath, "utf-8");
    // Must have the [mcp_servers.lorejump] table — snake_case singular.
    expect(raw).toContain("[mcp_servers.lorejump]");
    expect(raw).not.toContain("[mcp.servers.lorejump]"); // wrong shape
    expect(raw).not.toContain("[mcpServers"); // wrong case
    // Round-trip parse to confirm valid TOML
    const parsed = toml.parse(raw) as Record<string, unknown>;
    const ms = parsed.mcp_servers as Record<string, { url: string }>;
    expect(ms.lorejump?.url).toBe(MCP_URL);
  });

  it("preserves user customization (won't overwrite manual url change)", async () => {
    const path = join(fakeHome, ".codex", "config.toml");
    await mkdir(join(fakeHome, ".codex"), { recursive: true });
    const userUrl = "https://my-mirror.example.com/mcp";
    await writeFile(
      path,
      `[mcp_servers.lorejump]\nurl = "${userUrl}"\n`,
    );
    const result = await mergeTomlEntry({
      path,
      rootKey: "mcp_servers",
      entryName: "lorejump",
      entryValue: { url: MCP_URL },
      preserveUserEdit: true,
    });
    expect(result.wasNew).toBe(false);
    const raw = await readFile(path, "utf-8");
    expect(raw).toContain(userUrl);
    expect(raw).not.toContain(MCP_URL);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// hermes — YAML config, mcp_servers snake_case
// ─────────────────────────────────────────────────────────────────────────
describe("hermes adapter (C2: YAML mcp_servers snake_case)", () => {
  it("probes via ~/.hermes/", async () => {
    await mkdir(join(fakeHome, ".hermes"), { recursive: true });
    expect(await hermes.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("MCP path is ~/.hermes/config.yaml with mcp_servers key (snake_case)", async () => {
    const result = await hermes.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toBe(join(fakeHome, ".hermes", "config.yaml"));
    const raw = await readFile(result.configPath, "utf-8");
    expect(raw).toMatch(/mcp_servers:/);
    expect(raw).not.toMatch(/mcpServers:/); // snake_case enforced
    const parsed = yaml.load(raw) as { mcp_servers: { lorejump: { url: string } } };
    expect(parsed.mcp_servers.lorejump.url).toBe(MCP_URL);
  });

  it("preserves existing servers when adding lorejump", async () => {
    const path = join(fakeHome, ".hermes", "config.yaml");
    await mkdir(join(fakeHome, ".hermes"), { recursive: true });
    await writeFile(
      path,
      "providers:\n  openai: {}\nmcp_servers:\n  filesystem:\n    command: npx\n    args: [-y, '@modelcontextprotocol/server-filesystem', /tmp]\n",
    );
    const result = await mergeYamlEntry({
      path,
      rootKey: "mcp_servers",
      entryName: "lorejump",
      entryValue: { url: MCP_URL },
    });
    expect(result.preservedExisting).toEqual(["filesystem"]);
    const parsed = yaml.load(await readFile(path, "utf-8")) as {
      providers: { openai: object };
      mcp_servers: { filesystem: { command: string }; lorejump: { url: string } };
    };
    expect(parsed.providers.openai).toBeDefined();
    expect(parsed.mcp_servers.filesystem.command).toBe("npx");
    expect(parsed.mcp_servers.lorejump.url).toBe(MCP_URL);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// gemini-cli — ~/.gemini/settings.json + httpUrl (Streamable HTTP, NOT url=SSE)
// ─────────────────────────────────────────────────────────────────────────
describe("gemini-cli adapter (C2: httpUrl not url)", () => {
  it("probes via project .gemini/", async () => {
    await mkdir(join(tmp, ".gemini"), { recursive: true });
    expect(await geminiCli.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("probes via user ~/.gemini/", async () => {
    await mkdir(join(fakeHome, ".gemini"), { recursive: true });
    expect(await geminiCli.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes skills under ~/.gemini/skills/<name>/SKILL.md (uppercase)", async () => {
    const paths = await geminiCli.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    for (const p of paths) {
      expect(p).toMatch(/\/\.gemini\/skills\/lorejump-(optimize|harness)\/SKILL\.md$/);
      expect(p.startsWith(fakeHome)).toBe(true);
      expect(existsSync(p)).toBe(true);
    }
  });

  it("MCP path is ~/.gemini/settings.json, entry uses 'httpUrl' field", async () => {
    const result = await geminiCli.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toBe(join(fakeHome, ".gemini", "settings.json"));
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.httpUrl).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.url).toBeUndefined(); // url=SSE in gemini convention
  });
});

// ─────────────────────────────────────────────────────────────────────────
// antigravity — ~/.gemini/antigravity/mcp_config.json + AGENTS.md fenced section
// ─────────────────────────────────────────────────────────────────────────
describe("antigravity adapter", () => {
  it("probes via ~/.gemini/antigravity/", async () => {
    await mkdir(join(fakeHome, ".gemini", "antigravity"), { recursive: true });
    expect(await antigravity.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("does NOT probe just on plain ~/.gemini/", async () => {
    await mkdir(join(fakeHome, ".gemini"), { recursive: true });
    expect(await antigravity.probe({ cwd: tmp, homedir: fakeHome })).toBe(false);
  });

  it("writes skills as fenced sections in <cwd>/AGENTS.md", async () => {
    const paths = await antigravity.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    expect(paths).toEqual([join(tmp, "AGENTS.md")]);
    const body = await readFile(paths[0]!, "utf-8");
    expect(body).toContain("<!-- BEGIN LOREJUMP skill:lorejump-optimize -->");
    expect(body).toContain("<!-- END LOREJUMP skill:lorejump-optimize -->");
    expect(body).toContain("<!-- BEGIN LOREJUMP skill:lorejump-harness -->");
    expect(body).toContain("<!-- END LOREJUMP skill:lorejump-harness -->");
    expect(body).toContain(FAKE_SKILLS["lorejump-optimize"].trim());
  });

  it("preserves user-edited content above/below fenced sections on re-install", async () => {
    const agentsMd = join(tmp, "AGENTS.md");
    await writeFile(agentsMd, "# My Project Rules\n\nDon't break the build.\n");
    await antigravity.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    const body = await readFile(agentsMd, "utf-8");
    expect(body).toContain("# My Project Rules");
    expect(body).toContain("Don't break the build.");
    expect(body).toContain("<!-- BEGIN LOREJUMP skill:lorejump-optimize -->");
    // Re-install should be idempotent (no duplicate fences).
    await antigravity.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    const after = await readFile(agentsMd, "utf-8");
    const beginCount = (after.match(/<!-- BEGIN LOREJUMP skill:lorejump-optimize -->/g) ?? []).length;
    expect(beginCount).toBe(1);
  });

  it("MCP path is ~/.gemini/antigravity/mcp_config.json with httpUrl field", async () => {
    const result = await antigravity.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    expect(result.configPath).toBe(
      join(fakeHome, ".gemini", "antigravity", "mcp_config.json"),
    );
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.httpUrl).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.url).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// trae — user scope (~/.trae/) is now default, project scope (.trae/) opt-in
// ─────────────────────────────────────────────────────────────────────────
describe("trae adapter (user scope default + project scope via flag)", () => {
  it("probes via project .trae/", async () => {
    await mkdir(join(tmp, ".trae"), { recursive: true });
    expect(await trae.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("probes via user ~/.trae/", async () => {
    await mkdir(join(fakeHome, ".trae"), { recursive: true });
    expect(await trae.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("default scope (user) writes to ~/.trae/skills/<name>/SKILL.md", async () => {
    const paths = await trae.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    for (const p of paths) {
      expect(p).toMatch(/\/\.trae\/skills\/lorejump-(optimize|harness)\/SKILL\.md$/);
      expect(p.startsWith(fakeHome)).toBe(true);
    }
  });

  it("explicit user scope writes to ~/.trae/", async () => {
    const paths = await trae.installSkills(
      { cwd: tmp, homedir: fakeHome, scope: "user" },
      FAKE_SKILLS,
    );
    for (const p of paths) {
      expect(p.startsWith(fakeHome)).toBe(true);
    }
  });

  it("project scope writes to <cwd>/.trae/", async () => {
    const paths = await trae.installSkills(
      { cwd: tmp, homedir: fakeHome, scope: "project" },
      FAKE_SKILLS,
    );
    for (const p of paths) {
      expect(p.startsWith(tmp)).toBe(true);
      expect(p).toMatch(/\/\.trae\/skills\/lorejump-(optimize|harness)\/SKILL\.md$/);
    }
  });

  it("MCP user-scope writes ~/.trae/mcp.json with type:http", async () => {
    const result = await trae.installMcp(
      { cwd: tmp, homedir: fakeHome, scope: "user" },
      "lorejump",
      { url: MCP_URL },
    );
    expect(result.configPath).toBe(join(fakeHome, ".trae", "mcp.json"));
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
    expect(after.mcpServers.lorejump.type).toBe("http");
  });

  it("MCP project-scope writes <cwd>/.trae/mcp.json", async () => {
    const result = await trae.installMcp(
      { cwd: tmp, homedir: fakeHome, scope: "project" },
      "lorejump",
      { url: MCP_URL },
    );
    expect(result.configPath).toBe(join(tmp, ".trae", "mcp.json"));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cross-cutting: ADAPTERS array shape
// ─────────────────────────────────────────────────────────────────────────
describe("adapter registry shape", () => {
  it("all 14 adapters have unique stable ids", async () => {
    const { ADAPTERS } = await import("../src/adapters/index.js");
    const ids = ADAPTERS.map((a) => a.id);
    expect(ids.length).toBe(14);
    expect(new Set(ids).size).toBe(14); // all unique
    // sanity: known ids present
    for (const expected of [
      "claude-code", "cursor", "antigravity", "gemini-cli", "trae",
      "vscode", "roo-code", "cline", "windsurf",
      "codebuddy", "qwen-code", "kimi-cli", "codex", "hermes",
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it("antigravity is ordered before gemini-cli in probe sequence", async () => {
    const { ADAPTERS } = await import("../src/adapters/index.js");
    const ids = ADAPTERS.map((a) => a.id);
    const agIdx = ids.indexOf("antigravity");
    const gcIdx = ids.indexOf("gemini-cli");
    expect(agIdx).toBeGreaterThanOrEqual(0);
    expect(gcIdx).toBeGreaterThanOrEqual(0);
    expect(agIdx).toBeLessThan(gcIdx);
  });
});

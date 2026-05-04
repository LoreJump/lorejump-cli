import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Integration tests for `lorejump doctor --json` output.
//
// We run the built dist/cli.js as a subprocess with HOME pointing at a temp
// directory, so the install-log fixture we drop is the one doctor reads.
// This avoids mocking fetch / vi.mock — slower but matches what users see.
//
// Build before running: `pnpm build`.

const CLI_PATH = join(__dirname, "..", "dist", "cli.js");
const SCHEMA_VERSION = "lorejump-doctor-v1";

let tmp: string;

beforeAll(async () => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      `dist/cli.js not built. Run \`pnpm build\` before this test suite.`,
    );
  }
});

function runDoctor(args: string[], home: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, "doctor", ...args], {
      env: { ...process.env, HOME: home, NO_COLOR: "1" },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
}

describe("doctor --json output (lorejump-doctor-v1)", () => {
  it("with no install-log: emits valid JSON with install_log_present=false", async () => {
    tmp = await mkdtemp(join(tmpdir(), "lj-doctor-test-"));

    const { stdout } = runDoctor(["--json", "--skip-version-check"], tmp);

    const report = JSON.parse(stdout);
    expect(report.schema).toBe(SCHEMA_VERSION);
    expect(report.install_log_present).toBe(false);
    expect(report.cli_version).toBeTruthy();
    expect(report.generated_at).toBeTruthy();
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks).toHaveLength(0);
    expect(report.agent_handoff).toBeDefined();
    expect(report.agent_handoff.skill_path).toContain("SKILL.md");
    expect(Array.isArray(report.agent_handoff.lorejump_self_docs)).toBe(true);

    await rm(tmp, { recursive: true, force: true });
  }, 15_000);

  it("with install-log + missing skill files: reports failures with observation + hypothesis", async () => {
    tmp = await mkdtemp(join(tmpdir(), "lj-doctor-test-"));
    const lorejumpDir = join(tmp, ".lorejump");
    await mkdir(lorejumpDir, { recursive: true });
    const fakeLog = {
      cli_version: "0.1.0-alpha.99",
      first_install_at: "2026-01-01T00:00:00.000Z",
      last_update_at: "2026-01-01T00:00:00.000Z",
      targets: [
        {
          agent: "claude-code",
          skill_paths: [
            join(tmp, "nonexistent", "SKILL.md"),
          ],
          skill_hashes: { "lorejump-optimize": "x", "lorejump-harness": "y" },
          mcp_config_path: join(tmp, "nonexistent.mcp.json"),
          mcp_entry_name: "lorejump",
          mcp_root_key: "mcpServers",
          mcp_format: "json",
          preserved_existing: [],
          scope: "user",
        },
      ],
    };
    await writeFile(join(lorejumpDir, "install-log.json"), JSON.stringify(fakeLog));

    const { stdout, status } = runDoctor(["--json", "--skip-version-check"], tmp);
    const report = JSON.parse(stdout);

    expect(report.schema).toBe(SCHEMA_VERSION);
    expect(report.install_log_present).toBe(true);

    const skillCheck = report.checks.find((c: { id: string }) => c.id === "skill_file");
    expect(skillCheck).toBeDefined();
    expect(skillCheck.status).toBe("fail");
    expect(skillCheck.observation).toBeDefined();
    expect(skillCheck.hypothesis).toBeDefined();
    expect(Array.isArray(skillCheck.hypothesis)).toBe(true);

    const mcpCheck = report.checks.find((c: { id: string }) => c.id === "mcp_config");
    expect(mcpCheck).toBeDefined();
    expect(mcpCheck.status).toBe("fail");
    expect(mcpCheck.observation.exists).toBe(false);

    expect(report.agent_handoff.failed_check_ids.length).toBeGreaterThan(0);
    // Claude Code IDE docs should be included since target.agent = claude-code
    expect(
      report.agent_handoff.ide_official_docs_for_handoff.some((u: string) =>
        u.includes("code.claude.com"),
      ),
    ).toBe(true);
    expect(status).toBe(1);

    await rm(tmp, { recursive: true, force: true });
  }, 15_000);

  it("agent_handoff.ide_official_docs_for_handoff aggregates per agent_id", async () => {
    tmp = await mkdtemp(join(tmpdir(), "lj-doctor-test-"));
    const lorejumpDir = join(tmp, ".lorejump");
    await mkdir(lorejumpDir, { recursive: true });
    const fakeLog = {
      cli_version: "0.1.0-alpha.99",
      first_install_at: "2026-01-01T00:00:00.000Z",
      last_update_at: "2026-01-01T00:00:00.000Z",
      targets: [
        {
          agent: "cursor",
          skill_paths: [join(tmp, "x.md")],
          skill_hashes: { "lorejump-optimize": "x", "lorejump-harness": "y" },
          mcp_config_path: join(tmp, ".cursor.mcp.json"),
          mcp_entry_name: "lorejump",
          mcp_root_key: "mcpServers",
          mcp_format: "json",
          preserved_existing: [],
          scope: "project",
        },
      ],
    };
    await writeFile(join(lorejumpDir, "install-log.json"), JSON.stringify(fakeLog));

    const { stdout } = runDoctor(["--json", "--skip-version-check"], tmp);
    const report = JSON.parse(stdout);

    expect(
      report.agent_handoff.ide_official_docs_for_handoff.some((u: string) =>
        u.includes("docs.cursor.com"),
      ),
    ).toBe(true);

    await rm(tmp, { recursive: true, force: true });
  }, 15_000);
});

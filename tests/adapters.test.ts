import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCode } from "../src/adapters/claude-code.js";
import { cursor } from "../src/adapters/cursor.js";
import { trae } from "../src/adapters/trae.js";
import { mergeJsonEntry } from "../src/utils/json-merge.js";
import { sha256 } from "../src/utils/fs-safe.js";

const FAKE_SKILLS = {
  "lorejump-optimize": "# optimize skill\n\n50 bytes minimum content blah blah blah blah blah\n",
  "lorejump-harness": "# harness skill\n\n50 bytes minimum content blah blah blah blah blah\n",
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

describe("claude-code adapter", () => {
  it("probes true when project .claude/ exists", async () => {
    await mkdir(join(tmp, ".claude"), { recursive: true });
    expect(await claudeCode.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("probes true via user homedir fallback", async () => {
    await mkdir(join(fakeHome, ".claude"), { recursive: true });
    expect(await claudeCode.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("probes false when neither exists", async () => {
    expect(await claudeCode.probe({ cwd: tmp, homedir: fakeHome })).toBe(false);
  });

  it("writes skills under project .claude/skills/", async () => {
    await mkdir(join(tmp, ".claude"), { recursive: true });
    const paths = await claudeCode.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
      expect(p.endsWith("SKILL.md")).toBe(true);
    }
    const optimize = await readFile(paths[0]!, "utf-8");
    expect(optimize).toBe(FAKE_SKILLS["lorejump-optimize"]);
  });

  it("merges MCP into .mcp.json preserving existing servers", async () => {
    await mkdir(join(tmp, ".claude"), { recursive: true });
    await writeFile(
      join(tmp, ".mcp.json"),
      JSON.stringify({ mcpServers: { notion: { url: "https://x" }, github: { url: "https://y" } } }, null, 2),
    );
    const result = await claudeCode.installMcp(
      { cwd: tmp, homedir: fakeHome },
      "lorejump",
      { url: MCP_URL },
    );
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.notion.url).toBe("https://x");
    expect(after.mcpServers.github.url).toBe("https://y");
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
    expect(result.preservedExisting.sort()).toEqual(["github", "notion"]);
  });
});

describe("cursor adapter", () => {
  it("probes via .cursor/", async () => {
    await mkdir(join(tmp, ".cursor"), { recursive: true });
    expect(await cursor.probe({ cwd: tmp, homedir: fakeHome })).toBe(true);
  });

  it("writes skills + mcp", async () => {
    await mkdir(join(tmp, ".cursor"), { recursive: true });
    const paths = await cursor.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    expect(paths.every((p) => p.includes("/.cursor/skills/"))).toBe(true);
    const result = await cursor.installMcp({ cwd: tmp, homedir: fakeHome }, "lorejump", { url: MCP_URL });
    const after = JSON.parse(await readFile(result.configPath, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
  });
});

describe("trae adapter (C2 schema trap)", () => {
  it("writes SKILL.md with EXACT uppercase filename", async () => {
    await mkdir(join(tmp, ".trae"), { recursive: true });
    const paths = await trae.installSkills({ cwd: tmp, homedir: fakeHome }, FAKE_SKILLS);
    for (const p of paths) {
      // Must end with literal "SKILL.md" (uppercase) — Trae rejects "skill.md"
      // even on case-insensitive filesystems. CI must run on Linux to assert this.
      expect(p.endsWith("/SKILL.md")).toBe(true);
      expect(p.endsWith("/skill.md")).toBe(false);
    }
  });
});

describe("json-merge edge cases", () => {
  it("creates the file if it does not exist", async () => {
    const path = join(tmp, "fresh.json");
    const r = await mergeJsonEntry({
      path,
      rootKey: "mcpServers",
      entryName: "lorejump",
      entryValue: { url: MCP_URL },
    });
    expect(r.wasNew).toBe(true);
    expect(r.preservedExisting).toEqual([]);
    const after = JSON.parse(await readFile(path, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(MCP_URL);
  });

  it("preserves user customization to the lorejump entry", async () => {
    const path = join(tmp, "custom.json");
    const userUrl = "https://my-mirror.example.com/mcp";
    await writeFile(
      path,
      JSON.stringify({ mcpServers: { lorejump: { url: userUrl } } }, null, 2),
    );
    const r = await mergeJsonEntry({
      path,
      rootKey: "mcpServers",
      entryName: "lorejump",
      entryValue: { url: MCP_URL },
      preserveUserEdit: true,
    });
    expect(r.wasNew).toBe(false);
    const after = JSON.parse(await readFile(path, "utf-8"));
    expect(after.mcpServers.lorejump.url).toBe(userUrl);
  });

  it("rejects corrupted JSON without writing", async () => {
    const path = join(tmp, "broken.json");
    await writeFile(path, "{ this is not valid json,,, }");
    await expect(
      mergeJsonEntry({
        path,
        rootKey: "mcpServers",
        entryName: "lorejump",
        entryValue: { url: MCP_URL },
      }),
    ).rejects.toThrow(/parse/i);
    const after = await readFile(path, "utf-8");
    expect(after).toBe("{ this is not valid json,,, }"); // untouched
  });

  it("preserves jsonc comments through merge", async () => {
    const path = join(tmp, "withcomments.json");
    const original = `{
  // user's notes about why notion is here
  "mcpServers": {
    "notion": { "url": "https://x" }
  }
}`;
    await writeFile(path, original);
    await mergeJsonEntry({
      path,
      rootKey: "mcpServers",
      entryName: "lorejump",
      entryValue: { url: MCP_URL },
    });
    const after = await readFile(path, "utf-8");
    expect(after).toContain("// user's notes");
    expect(after).toContain("notion");
    expect(after).toContain("lorejump");
  });
});

describe("sha256 helper", () => {
  it("computes stable hashes", () => {
    const a = sha256("hello");
    const b = sha256("hello");
    const c = sha256("HELLO");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

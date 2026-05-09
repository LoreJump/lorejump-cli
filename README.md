# @lorejump/cli

Cross-platform installer for LoreJump skill + MCP. One command across Claude Code, Cursor, Trae, VS Code, Codex CLI, Windsurf, Qwen Code, Kimi-CLI, Gemini CLI, Antigravity, Hermes, CodeBuddy, OpenClaw, Cline/Roo Code — and a handoff mode for everything else.

> Status: scaffold. v1 in active development. See [`docs/specs/cli-installer/spec.md`](https://github.com/LoreJump/lorejump-cli/blob/main/docs/specs/cli-installer/spec.md) once published.

## Install

```bash
# Global
npm i -g @lorejump/cli

# One-shot
npx @lorejump/cli install

# China-friendly (curl|bash via CDN)
curl -fsSL https://lorejump.com/install.sh | bash
```

## Commands

```bash
lorejump install            # Detect agent → install LoreJump skill+MCP
lorejump install --tool=<n> # Force a specific preset adapter or "handoff"
lorejump doctor             # Verify install integrity (paths, schema, MCP endpoint)
lorejump update             # Refresh installed SKILL.md to latest CLI-shipped content
```

## Supported agents (v1 preset)

Claude Code · OpenClaw · Cursor · Antigravity · Gemini CLI · QoderWork · Trae · CodeBuddy · VS Code · Codex CLI · Windsurf · Qwen Code · Kimi-CLI · Hermes · Cline / Roo Code

Other agents → handoff mode (CLI emits `/tmp/lorejump-handoff/INSTALL.md`, your agent finishes the install).

## Known limitations

- **MiniMax agent** (Hailuo / 海螺): the consumer chat product currently exposes no UI for adding a third-party MCP server. This is a client limitation, not a LoreJump one — wait for MiniMax to ship user-side custom MCP support, or use any of the supported agents above for now.
- **Antigravity skill**: Antigravity has no native skill directory yet. The CLI installs LoreJump skills as appended fenced blocks in `<cwd>/AGENTS.md` (Antigravity's official instruction layer). User-edited content above the fenced block is preserved on `lorejump update`.
- **Trae user scope**: Trae supports `~/.trae/skills/` + `~/.trae/mcp.json` (user-global) since v1.3+. Use `--scope=user` to install there; default is project-scope at `<cwd>/.trae/`.
- **QoderWork MCP type field**: Qoder requires `"type": "streamable-http"` (with hyphen, lowercase) — different from Claude Code's `"type": "http"` and Cline's `"type": "streamableHttp"`. The adapter handles this automatically.

## Cherry Studio — no separate adapter (intentional)

Cherry Studio (a popular Chinese open-source desktop AI workbench) reads skills from the same `<cwd>/.claude/skills/` path Claude Code uses, so we do **not** ship a dedicated `cherry-studio` adapter. Workflow:

1. Run `lorejump install --tool=claude-code --scope=project` in your Cherry Studio working directory.
2. Cherry Studio auto-loads the resulting `.claude/skills/lorejump-optimize/` and `.claude/skills/lorejump-harness/`.
3. For MCP, open Cherry Studio's MCP panel (Settings → MCP), add a new server with URL `https://mcp.lorejump.com/mcp` — the GUI panel handles the rest.

## License

MIT

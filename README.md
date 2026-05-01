# @lorejump/cli

Cross-platform installer for LoreJump skill + MCP. One command across Claude Code, Cursor, Trae, VS Code, Codex CLI, Windsurf, Qwen Code, Kimi-CLI, Hermes, CodeBuddy, OpenClaw, Cline/Roo Code — and a handoff mode for everything else.

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

Claude Code · OpenClaw · Cursor · Trae · CodeBuddy · VS Code · Codex CLI · Windsurf · Qwen Code · Kimi-CLI · Hermes · Cline / Roo Code

Other agents → handoff mode (CLI emits `/tmp/lorejump-handoff/INSTALL.md`, your agent finishes the install).

## License

MIT

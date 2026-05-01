# LoreJump install handoff — instructions for your agent

> You (the agent) are reading this because the LoreJump CLI could not match
> any of its 12 preset adapters in the user's environment, so it has handed
> control to you to finish the install. This file is **CLI-shipped fixed text**
> — no part of it was generated from the user's repo, environment, or prompt.

## Your task

You must do four things, in order:

1. **Self-identify**: inspect the local filesystem for config markers and decide
   which agent runtime you are running inside. Report your reasoning in the
   `agent_self_description` field of the receipt (see §5).
2. **Place the bundled SKILL.md files**: copy
   `/tmp/lorejump-handoff/skills/lorejump-optimize/SKILL.md` and
   `/tmp/lorejump-handoff/skills/lorejump-harness/SKILL.md` into the agent's
   skill directory. See §2 for known conventions.
3. **Merge the MCP config**: add the entry from
   `/tmp/lorejump-handoff/mcp-config.json` (`mcpServers.lorejump`) into the
   agent's MCP config file. Preserve every existing entry and any comments.
4. **Write a JSON receipt**: write `/tmp/lorejump-handoff/install-log.json`
   matching the schema in §5 so `lorejump doctor` can verify your work.

## §2. Known agent conventions

If you can identify yourself as one of the agents below, follow that row exactly.
If you cannot, follow §3.

| Agent | Skill dir | MCP config file | MCP root key | Notes |
|---|---|---|---|---|
| Windsurf | (no skill dir; append to `.windsurfrules` instead) | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | |
| Codex CLI | (no skill concept; inject into `~/.codex/AGENTS.md`) | `~/.codex/config.toml` | `[mcp_servers.lorejump]` | TOML, not JSON |
| OpenCode | `<project>/.opencode/skills/<name>/SKILL.md` | `<project>/.opencode/mcp.json` | `mcpServers` | |
| Augment | `<project>/.augment/skills/<name>/SKILL.md` | `<project>/.augment/mcp.json` | `mcpServers` | |
| Aide | `<project>/.aide/skills/<name>/SKILL.md` | `<project>/.aide/mcp.json` | `mcpServers` | |
| Continue | (no skill concept; inject into rules) | `~/.continue/config.json` | `mcpServers` | |
| Cline / Roo Code | (no skill dir; append to `.clinerules` / `.roo/rules`) | `cline_mcp_settings.json` | `mcpServers` | |
| GLM Coding | (form unstable as of 2026) | check `~/.glm/` first | best-guess | When in doubt, fall back to §3 |

Filenames matter: the skill directory entry **must be exactly `SKILL.md`**
(uppercase). Some agents (notably ByteDance Trae) reject lowercase `skill.md`
even on case-insensitive filesystems.

## §3. Exploration principles when no row matches

- Look in conventional locations: `<cwd>/.<agent-name>/`, `~/.<agent-name>/`,
  `~/.config/<agent-name>/`.
- Check whether the agent has a CLI subcommand for MCP installation
  (e.g. `<agent> mcp add ...`). If so, prefer that over manual file editing.
- If the agent has no concept of "skill", do not invent one. Append a short
  marker block to the project root `AGENTS.md` (or create one) directing the
  agent to read the bundled SKILL.md files at `/tmp/lorejump-handoff/skills/`.
- If you cannot determine the right path with confidence, **stop and write an
  error to the receipt** — do not guess. `lorejump doctor` will give the user
  next steps.

## §4. Things you must NOT do

- Do not invent new MCP config schema fields. Use only `url` (or, if a transport
  block is required, `{ "url": "<MCP_URL>", "transport": "http" }`).
- Do not write to system root paths (`/etc`, `/usr`, `/opt`, `C:\\Program Files`).
- Do not silently report success: if any step fails, write `errors[]` and let
  doctor handle it.
- Do not modify or remove any existing entries in the agent's MCP config —
  only add the `lorejump` entry.

## §5. Receipt schema (`install-log.json`)

```json
{
  "agent_detected": "windsurf | hermes | unknown-but-tried",
  "agent_self_description": "one sentence: agent name + version + how you decided",
  "skill_paths": [
    "absolute path to first SKILL.md you wrote",
    "absolute path to second SKILL.md you wrote"
  ],
  "mcp_config_path": "absolute path of the MCP config file you merged into",
  "mcp_merge_strategy": "json-deep-merge | toml-section-add | cli-subcommand | append-marker",
  "fallback_used": "agents-md | clinerules | null",
  "preserved_existing": [
    "names of other mcpServers that were present and that you did NOT modify"
  ],
  "errors": [
    "any failures or uncertainties — list as plain strings; empty array if all OK"
  ],
  "next_action_for_user": "any user-facing note, e.g. 'reload your IDE to pick up the new MCP'"
}
```

## §6. Bundled materials at `/tmp/lorejump-handoff/`

- `skills/lorejump-optimize/SKILL.md` — primary diagnostic skill
- `skills/lorejump-harness/SKILL.md` — agent harness eval skill
- `mcp-config.json` — canonical `lorejump` MCP entry (URL is fixed; do not change)
- `INSTALL.md` — this document

After you finish, the user runs `lorejump doctor` and the CLI verifies every
fact in your receipt. If any fact does not check out, `doctor` will print a
concrete next step that the user pastes back to you so you can fix it.

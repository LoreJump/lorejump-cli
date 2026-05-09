# @lorejump/cli

LoreJump skill + MCP 的跨平台安装器。一条命令覆盖 Claude Code / Cursor / Google Antigravity / Gemini CLI / 字节 Trae / VS Code / Codex CLI / Windsurf / 阿里 Qwen Code / 月之暗面 Kimi-CLI / Hermes / 腾讯 CodeBuddy / OpenClaw / Cline / Roo Code，未识别 agent 进 handoff 模式由用户的 agent 自己接力。

> 状态：骨架。v1 开发中。完整 spec 见 [`docs/specs/cli-installer/spec.md`](https://github.com/LoreJump/lorejump-cli/blob/main/docs/specs/cli-installer/spec.md)（待发布）。

## 安装

```bash
# 全局
npm i -g @lorejump/cli

# 一次性
npx @lorejump/cli install

# 国内友好（curl|bash 走 CDN）
curl -fsSL https://lorejump.com/install.sh | bash
```

## 命令

```bash
lorejump install              # 自动探测 agent → 装 LoreJump skill+MCP
lorejump install --tool=<n>   # 强指 preset adapter 或 "handoff"
lorejump doctor               # 核验安装完整性（路径/schema/MCP 端点连通）
lorejump update               # 刷新已落盘的 SKILL.md 到当前 CLI 版本内容
```

## v1 支持的 agent（preset）

Claude Code · OpenClaw · Cursor · Google Antigravity · Gemini CLI · 字节 Trae · 腾讯 CodeBuddy · VS Code · Codex CLI · Windsurf · 阿里 Qwen Code · 月之暗面 Kimi-CLI · Hermes · Cline / Roo Code

其他 agent → handoff 接力模式（CLI 写出 `/tmp/lorejump-handoff/INSTALL.md`，由用户的 agent 自己完成安装）。

## 已知限制

- **MiniMax agent（海螺）**：目前消费端 chat 产品没有用户侧添加第三方 MCP 的入口，等 MiniMax 官方放开 user-side custom MCP UI 后才能集成。属于客户端限制，不是 LoreJump 限制；当前可改用上面任一支持 agent。
- **Antigravity skill 安装路径**：Antigravity 还没有原生 skill 目录约定。CLI 把 LoreJump skill 以 fenced 块形式追加到 `<cwd>/AGENTS.md`（Antigravity 官方指令层）。`lorejump update` 时 fenced 块外的用户内容会被保留。
- **Trae user scope**：Trae v1.3+ 起支持 `~/.trae/skills/` + `~/.trae/mcp.json` 用户级目录。用 `--scope=user` 装到 user 级，默认仍是项目级（`<cwd>/.trae/`）。

## License

MIT

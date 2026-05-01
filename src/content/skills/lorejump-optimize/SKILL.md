---
name: lorejump-optimize
description: 逻辑跃迁 AI 工作流诊断 — 拉 SOTA 画像、对照打分、给可执行方案、协助 apply、回报演化。零配置启动，多轮收尾。
user-invocable: true
version: 3.0
---

你是逻辑跃迁（LoreJump）AI 工作流诊断执行剧本（v3.0）。**SOTA 画像、维度权重、最近实践都由 lorejump-mcp 的 `get_sota_pack` 一次拉齐**；你按语义对照、打分、给方案、协助 apply、回报。**不内嵌评分公式，不渲染 band 命名锁定，不做 cohort/percentile/expected_delta 数字**——它们违反 ADR-013 的 P3。

> ADR-013（2026-04-25）变更摘要见 `matchJobAI/技术架构/02-技术选型决策记录.md` §ADR-013 + `matchJobAI/mvp/00-核心产品机制设计.md` v2.0 §三/四/五。

## 闭环（多轮对话 + 三事件点回报）

```
R1 scan        — Step 1-7：扫描 + 拉 SOTA + 对照打分 + 出方案 + submit_report(scan)
R2 apply       — Step 8（每条选中的方案）：dry-run + 用户确认 + 写文件 + verify + submit_report(apply, parent=R1)
R3 session_close — Step 9：会话收尾总结 + submit_report(session_close, parent=R1)
```

## Step 1: 环境检测（< 5 秒，并行）

1. **项目名**：从 `package.json.name` / `Cargo.toml` / `go.mod` / 目录名提取
2. **project_type**：
   - `code`：有 `package.json` / `Cargo.toml` / `go.mod` / Python 入口
   - `docs`：无代码入口，`.md` 为主
   - `new`：总文件数 < 5
3. **stack_signature**：拼接 `<lang>+<framework>+<runtime>`，如 `ts+astro+cf-workers`，缺则 `unknown`
4. **Git**：`git log --oneline -20`（非 git → 标 D3 N/A）
5. **历史**：读 `.lorejump/history.json`（可能不存在；含 `last_scan_report_id` 时一并备用）
6. **project_fingerprint**：合并 has_claude_md / has_mcp / .claude/skills/* / .claude/hooks/* / claude_code_version

## Step 2: 拉 SOTA pack（必需，一次调用）

```
get_sota_pack({
  project_type,
  stack_signature,
  project_fingerprint,           // 含 dimensions（首次扫描可缺）
  since_report_id?,              // 仅 /lorejump-harness 重跑时传
  max_recent_practices: 10,
  max_applicable_gaps: 5,
})
```

返回结构（不再分多 tool 拉取）：

```jsonc
{
  "sota_pack_version": "sp-x.y",
  "tier": "public" | "free" | "pro" | "internal",
  "project_type": "code|docs|new",
  "dimensions": [
    { "key", "name", "weight",
      "sota_picture": "<对该维度 SOTA 的叙事 + 各分位条件 + 参照>",
      "sota_reference": "<引用源>",
      "signals": ["<扫描信号 1>", "<扫描信号 2>"],
      "confidence_hint": "high=直接观察 / med=间接推断 / low=缺证据" },
    ...
  ],
  "evolution_highlights": [
    { "chain": "...", "current_state": "...", "recent_signals": [...] }, ...
  ],
  "recent_practices": [
    { "id", "title", "category", "applicable_to": [...], "effort", "impact",
      "date_added", "body", "source_url", "source_tier" }, ...
  ],
  "applicable_gaps": [
    { "entry_id", "title", "priority_score", "reason", "suggested_actions": [...] }, ...
  ],
  "nudge": "<可选：H1 diff digest 文本 / DR 建议主题>",
  "upgrade_cta": "<仅 public tier>"
}
```

**降级处理（MCP 未连接）**：调用失败、tool 不存在、连接超时 → 立即输出错误卡片并终止流程，**不要尝试内建 rubric**：

```
⚠️ 逻辑跃迁 MCP Server 未连接

本 skill 依赖 MCP 后端（lorejump-mcp）下发 SOTA 画像，无法独立运行。

一键安装（推荐，含 skill + MCP）：
  /plugin marketplace add LoreJump/claude-plugins
  /plugin install lorejump-optimize@lorejump
  /reload-plugins

或仅连接 MCP：
  claude mcp add --transport http lorejump https://mcp.lorejump.com/mcp

安装后请重新运行 /lorejump-optimize。
```

`tier: "public"` 时正常出分但末尾展示 `upgrade_cta`，**不发 R1 报告**（隐私 / 滥用门槛）。

## Step 3: 按 SOTA 画像扫描 + 打分（语义对照，不机械判分）

对 `dimensions` 中每一项：
1. 执行 `signals` 列出的扫描指令（Glob / Read / Bash）收集证据
2. 把扫描结果**用语义理解对照** `sota_picture`，给出 1-5 整数分
3. 同时给一个 **self_confidence**：`high` / `med` / `low`（参考 `confidence_hint`）
4. 记 1-2 句 evidence（引用具体路径/数字，不传文件全文）
5. public tier 下 `sota_picture` 已粗化，保守给中间分（2-4），confidence 一律 `low`

## Step 4: 聚合（无 band 命名锁定）

- 按 `weight` 加权：`weighted = Σ(Di × Wi)`，`total = round(weighted × 20)`（0-100）
- `docs` 类型把 `testing_quality` / `automation` 权重置 0 后归一化（参 00 v2.0 §二.4）
- **不要**渲染 Baseline/Solid/High/Elite band 命名（P3）；只输出数字 + 自评置信度

## Step 5: 报告渲染（叙事优先）

```
🔍 逻辑跃迁 AI 工作流诊断 — {项目名}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

总分 {total} / 100（{置信度：高/中/低}）
SOTA pack: {sota_pack_version} · Skill v3.0

维度评分：
  {name}  {进度条10格}  {score}/5  ({weight*100}%)  · SOTA: {sota_reference}
  ...

📊 与上次对比（{old_date}）：              ← 仅 .lorejump/history.json 存在时
  总分 {old}→{new}（{Δ}）；{自然语言归因}

🎯 Top 3 改进方案：                        ← 来自 applicable_gaps + recent_practices
  1. [{维度}] {title}（impact={impact}, effort={effort}）
     {suggested_actions[0].summary}
     来源：{source_url}（{source_tier}）

🔧 Harness 升级机会：                      ← applicable_gaps 余下 + nudge 提示
  - {entry.title}（priority {score}）：{reason}

💡 演变信号：                              ← 来自 evolution_highlights
  - {chain}：{current_state}
```

进度条：每分 2 格 `█`，空 `░`，共 10 格。
**不要渲染**：百分位 / "top X%" / expected_delta 数字 / streak / band 命名 / 徽章。

## Step 6: 历史与本地状态

写 `.lorejump/history.json`（追加到 `scans[]`）：

```json
{
  "project": "{name}",
  "scans": [{
    "date": "{iso}",
    "version": "3.0",
    "sota_pack_version": "{server-side}",
    "total": {n},
    "self_confidence": "high|med|low",
    "dimensions": { "{key}": {1-5}, ... },
    "applied_practice_keys": []   // R2 apply 后回填
  }]
}
```

**不写** band_key（已删除）。文件不存在则建；JSON 损坏则备份 `.bak` 后重建。

## Step 7: 提交 R1（scan 报告）

构造一份 markdown 报告（含 YAML frontmatter），调用：

```
submit_report({
  report_type: "scan",
  body_md: <下方 markdown>,
  parent_report_id: null
})
```

**body_md 模板**：

```markdown
---
report_type: scan
agent_local_time: <ISO>
project_group_id: <hmac sha256 of repo abspath, by skill DLP>
stack_signature: <ts+astro+cf-workers 等>
project_type: code
skill_version: 3.0.0
mcp_server_version: <从 / endpoint 读，可缺>
sota_pack_version: <来自 get_sota_pack 响应>
total_score: 63
dimensions: { D1: 3, D2: 4, D3: 3, D4: 2, D5: 4, D6: 3, D7: 2 }
self_confidence: med
---

# 逻辑跃迁诊断 — <project>

## 现状叙述
<2-4 句，agent 自然语言描述本项目当前 AI 工作方式的特征>

## 维度差距叙述
<对低分维度（≤3）写一段：观察到什么、为什么差、SOTA 在哪>

## Top N 方案（agent 可直接 apply）
1. <title> — <一句话>
   `<action_for_agent 文本指令块，可被 R2 直接消费>`
2. ...

## 用户对此次诊断的初读反应（可空）
```

提交失败 / `tier:public` → 静默跳过，不阻断用户。`PAYLOAD_TOO_LARGE` → 压缩"现状叙述"和"差距叙述"，重试一次。

## Step 8: R2 apply 闭环（每条选中的方案）

```
用户选 [1, 3] → 对每条循环：
  1) skill → agent: 把方案的 action_for_agent 文本指令展示
  2) agent: dry-run（Read / Grep 确认目标文件存在 + 输出预期 diff）
  3) skill → user: 显示 diff，问"确认 apply?（Y/n/skip）"
  4) Y → agent 写文件（Edit / Write）
  5) skill → agent: 跑 verify
       - 改了 src/ 代码 → `pnpm typecheck` + `pnpm test`（若 script 存在）
       - 改了 .claude/* → 重扫该维度（重跑 Step 3 仅该维度）
       - 改了文档 → 仅校验链接
  6) verify_status = pass | fail | mixed
  7) 写 .lorejump/history.json 最新 scan 的 applied_practice_keys[] 追加
  8) submit_report({
       report_type: "apply",
       parent_report_id: <R1 report_id>,
       body_md: <见下>
     })
```

**R2 body_md 模板**：

```markdown
---
report_type: apply
parent_report_id: <R1 uuid>
agent_local_time: <ISO>
applied_practice_keys: [<entry_id 或 dim_keyN>]
verify_status: pass | fail | mixed
skill_version: 3.0.0
sota_pack_version: <透传>
---

# Apply: <entry.title>

## 改了什么
- <file1>: <一句话>
- <file2>: <一句话>

## verify 结果
<pass: 描述 / fail: 错误片段 + 假设原因>

## agent 自述
<1-3 句：apply 体验、是否需要后续动作>
```

**不传**：原 diff 全文 / 文件路径绝对值 / 用户 prompt 原文。

## Step 9: R3 session_close

会话收尾触发条件：用户说"完事 / 跳过 / 没了 / 结束"，或 skill 判定无更多待选。流程：

1. 总结：apply 列表 / 跳过列表（含原因） / 用户对建议的反馈 / 用户对评分的异议
2. 提一句"下次起点"建议（基于剩余未 apply 的方案 + nudge）
3. 调用：

```
submit_report({
  report_type: "session_close",
  parent_report_id: <R1 uuid>,
  body_md: <见下>
})
```

**R3 body_md 模板**：

```markdown
---
report_type: session_close
parent_report_id: <R1 uuid>
agent_local_time: <ISO>
skill_version: 3.0.0
session_summary_keys: [skipped_reasons, user_feedback, next_step]
---

# 会话收尾

## apply 列表
- [<entry_id>] <title>: <verify 状态>

## 跳过列表
- [<entry_id>] <title>: <用户原因或推测>

## 用户反馈（如有）
<对评分异议 / 对方案适用性的判断 / 更好方案 / 原文已过时等>

## 下次起点
<1-2 句：基于剩余方案 + nudge 给出下次自然衔接点>
```

## DLP（隐私边界，提交前过滤）

frontmatter / body_md 进入 submit_report 前**必须**过滤：

- ❌ 文件路径绝对值 → 转 hmac 或 `<repo>/...` 相对路径
- ❌ git remote url / repo slug / origin host → 永不传
- ❌ 代码片段原文 → 只描述行为（"在 hook 里加了 typecheck 调用"）
- ❌ ENV / secret pattern → 命中即整段 drop
- ❌ 用户 prompt 原文 / IP / user_agent → 不收集

`project_group_id` 用 `crypto.subtle.digest('SHA-256', utf8(server_salt + repo_root_abspath))` 前缀 16 字节 hex，server_salt 从环境读（缺则用本地随机 salt，存 `.lorejump/.salt` gitignore）。

## 重要规则

- **只读扫描**（Step 1-3）：除 `.lorejump/history.json` 外不修改任何用户文件
- **写文件仅在 R2 apply**：用户明确确认每一条
- **三事件点全部走 submit_report**：不再有 submit_telemetry / submit_practice_feedback
- **MCP 故障 = 终止**：不内建 rubric / 不静默继续
- **public tier**：正常出分 + 显示 `upgrade_cta`，**不发 R1**
- **performance**：Step 1-7 < 30 秒；R2 apply 视方案而定
- **历史损坏**：备份 `.lorejump/history.json.bak` 后重建

## 变更日志

- v3.0 (2026-04-25)：ADR-013 重写。MCP 调用收敛到 `get_sota_pack` + `submit_report`；删 band×4 命名锁定；加 R1/R2/R3 三事件点回报；apply 后跑 verify；输出叙事优先。
- v2.1 (2026-04-15)：skill 版本协商 + IP 中心化（rubric 由 server 下发）
- v2.0 (2026-04-09)：Phase 3A v1 离线评分初版

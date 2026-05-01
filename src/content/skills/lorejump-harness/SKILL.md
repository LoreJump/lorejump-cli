---
name: lorejump-harness
description: 逻辑跃迁 Harness 持续升级 — 在你的项目里再跑一次 /lorejump-optimize 同款闭环，但带上次 scan_report_id 给 server，从 nudge 拿"自上次以来 X 条新实践"diff digest。建议每周一次。
user-invocable: true
version: 2.0
---

你是逻辑跃迁 Harness 持续升级执行剧本（v2.0）。**这不是另一套机制**——它就是 `/lorejump-optimize` 同款闭环再跑一次，区别只在：把上次的 `scan_report_id` 作为 hint 传给 server，server 在 `get_sota_pack` 响应的 `nudge` 字段返回 H1 diff digest 文本。

> ADR-013（2026-04-25）变更摘要见 `matchJobAI/技术架构/02-技术选型决策记录.md` §ADR-013 + `matchJobAI/mvp/00-核心产品机制设计.md` v2.0 §五.3。
>
> **不再做**：H2 peer band / H3 weekly email / H4 streak / H5 Wrapped / H6 PR decoration —— 全部违反 ADR-013 P5。仅保留 H1 diff digest，且作为 nudge 文本融入。

## 一次运行的闭环

```
[1 本地扫描 + 读上次 report_id]
    ↓
[2 get_sota_pack(since_report_id=last_scan_id)]   ← server 在 nudge 给 H1 diff
    ↓
[3 按 SOTA 画像打分（同 /lorejump-optimize Step 3）]
    ↓
[4 出诊断 + Top N 方案 + nudge 渲染]
    ↓
[5 submit_report(scan, parent=null)]              ← R1
    ↓
[6 用户挑方案 → dry-run → 确认 → 写文件 → verify → submit_report(apply, parent=R1)]   ← R2
    ↓
[7 submit_report(session_close, parent=R1)]                                          ← R3
    ↓
[8 写本地 cycle 报告 .lorejump/harness-cycle-YYYY-MM-DD.md]
```

**建议运行频率**：每周一次。

## 参数

- 无参数：**保守模式**（默认）— Step 6 只预览，不实际写文件
- `--apply`：**执行模式** — 用户确认后写文件
- `--since YYYY-MM-DD`：覆盖默认 since 日期（默认从 `.lorejump/history.json` 取最近一次 scan 日期，或 7 天前）
- `--deep`：Step 4 多调一次 WebFetch / Agent(Explore) 做交叉验证（+5 分钟）

## Stage 1 — 本地扫描（< 20 秒，并行）

参考 `/lorejump-optimize` Step 1 做完整 fingerprint 收集，**额外**：

- 读 `.lorejump/history.json`，取 `scans[最新]` 的 `report_id`（v3 起 history 应记录此字段；缺则视为首次）
- 读 `.lorejump/harness-cycle-last.txt`（不存在视为首次）
- 上次 scan 日期 → `since`（默认值）

## Stage 2 — get_sota_pack（一次调用拿齐）

```
get_sota_pack({
  project_type,
  stack_signature,
  project_fingerprint,                  // 含 dimensions（来自上次 scan 的 history）
  since_report_id: <从 history 读>,     // 让 server 算 H1 diff digest
  since: <上次 scan 日期>,              // 过滤 recent_practices
  max_recent_practices: 20,
  max_applicable_gaps: 10,
})
```

**server 返回的 `nudge` 字段直接渲染**——它已经是 H1 diff digest 文本（"自上次 12 天，新增 3 条与你 stack 相关的实践"）。skill 不在本地做 diff 比对。

**MCP 不可达**：fallback 到本地 `.mcp.json` 中其他 lorejump 条目；仍失败 → 提示 `/install` 引导，退出（不执行 Stage 3+）。

## Stage 3 — 按 SOTA 画像打分

完全复用 `/lorejump-optimize` Step 3 的"语义对照 + 自评置信度"打分方式。
**不在 harness 里硬编码评分公式**——同一份 SKILL.md 模式（IP 中心化）。

## Stage 4 — 输出诊断 + Top N 方案

参考 `/lorejump-optimize` Step 5 的报告格式。**额外**：

- 在报告顶部渲染 nudge 文本（H1 diff digest）
- 按 `applicable_gaps` 优先级排序，Top 5 作为本轮候选
- 若 `--deep`，对前 1 项额外调 `WebFetch <source_url>` 拉原文，把 1-2 句关键摘要追加到方案描述
- 其它 deep 调用（Agent Explore / 多 WebFetch）作为**建议块**输出给用户，**skill 不代跑**

## Stage 5 — R1 scan 报告

调用 `submit_report(type="scan", body_md=..., parent=null)`，模板与 `/lorejump-optimize` Step 7 一致。`body_md` 顶部 frontmatter 加一行：

```yaml
trigger: harness_cycle    # 区别于交互式 /lorejump-optimize
last_cycle_at: <上次 cycle 日期 或 null>
```

## Stage 6 — Apply 闭环（保守 / --apply）

每个用户选中的候选项：

1. dry-run（Read 目标文件 + 输出 diff 预览）
2. **保守模式**：只展示 diff，不执行；将"未应用项"汇总到 `.lorejump/harness-cycle-YYYY-MM-DD.md` 的"待你决定"节
3. **--apply 模式**：用户确认 → 写文件 → 跑 verify（参 `/lorejump-optimize` Step 8）→ `submit_report(apply, parent=R1)`

**边界约束（客户侧安全）**：
- 不修改 `src/` 应用代码（harness 范畴外）
- 不修改 `.git/` / `node_modules/` / build 产物
- 尊重 `.claude/hooks/protect-files.sh` 的拦截
- `npm install -g ...` 等只输出，不代跑

## Stage 7 — R3 session_close

会话收尾调 `submit_report(type="session_close", parent=R1)`。同 `/lorejump-optimize` Step 9 模板。`body_md` 末尾加"下次 cycle 建议时间 = 今日 + 7 天"。

## Stage 8 — 本地 cycle 报告

写 `.lorejump/harness-cycle-YYYY-MM-DD.md`：

```markdown
# LoreJump Harness Cycle — YYYY-MM-DD

## SOTA Pack 摘要
- pack_version: <>
- nudge: <H1 diff digest 原文>

## 本轮候选（Top N from applicable_gaps）
| ID | Title | priority | 状态 |
|----|-------|----------|------|

## 已应用（R2 apply）
- [<id>] <title> — verify=<status>

## 跳过 / 待评估
- [<id>] <title> — 原因：<>

## 下次建议
<1-2 句>
```

同时更新 `.lorejump/harness-cycle-last.txt = 今日`。

## 终端简报

```
✅ LoreJump Harness Cycle 完成 — YYYY-MM-DD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
候选 N / 应用 X / 跳过 Y / 待评估 Z

nudge: <一行 H1 diff digest>

📄 完整报告：.lorejump/harness-cycle-YYYY-MM-DD.md
🔄 下次建议：<today + 7 days>
```

## DLP

与 `/lorejump-optimize` 一致。`project_group_id` / `body_md` 提交前过滤路径原文 / git remote / 代码片段 / secret 命中。

## 失败处理

| 问题 | 处理 |
|------|------|
| MCP 不可达 | Stage 2 退出，引导 `/install` |
| `.lorejump/history.json` 缺 | fingerprint.dimensions = {}，仍可正常出 SOTA pack |
| 某条 entry_id 已 superseded | server 应返回新 id；skill 跳过旧 id 并在报告里标"已废弃，建议重跑" |
| `--apply` 中某项 verify fail | 该项标 `verify_status=fail` 但其他项继续；最终报告标红 |
| Supabase 写 R1/R2/R3 失败 | skill 本地缓存到 `.lorejump/report-queue.json`，下次 cycle 合并重传 |

## 重要规则

- **三方分工**：skill = 剧本 / MCP = SOTA 知识源 + 收件箱 / agent = 通用执行器
- **单一信息源**：所有 SOTA 数据只来自 `get_sota_pack`，不假设 lorejump 内部 KB 位置
- **客户决定一切外部动作**：WebFetch / Agent / shell 命令是建议块，skill 仅做文件 edit
- **保守默认**：无 `--apply` 时只预览
- **可重入**：同日期重跑不重复 apply 已 applied 的条目（按 `.lorejump/history.json.scans[最新].applied_practice_keys` 去重）

## 变更日志

- v2.0 (2026-04-25)：ADR-013 重写。collapse 7 个旧 MCP tool 调用 → 1 次 `get_sota_pack`；H1-H6 留存机制 → 仅 H1 nudge 文本；apply 走 R2 + verify；session_close 走 R3。删除 DeepResearch 多步建议块的旧 stage 划分（保留 `--deep` 选项作为单次 WebFetch 增强）。
- v1.0 (2026-04-13)：Phase Harness-v1 初版（H1-H6 多机制）

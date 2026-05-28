---
name: lorejump-harness
description: Continuous harness upgrade — re-run the /lorejump-optimize diagnosis loop in your project, but pass the previous scan_report_id as a hint so the server returns a "X new practices since last scan" diff digest in the nudge field. Recommended weekly. 逻辑跃迁 Harness 持续升级 — 重跑 /lorejump-optimize 同款闭环 + 拿 H1 diff digest。Use when the user asks for "lorejump harness", "weekly workflow check-in", "check new SOTA practices", "harness 升级", "看看最近的新实践", "re-scan my AI workflow", or wants to track how their workflow evolves over time.
user-invocable: true
version: 2.2
---

You are LoreJump's continuous harness upgrade skill. **Before doing anything else**, run the Language Detection step below to determine the user's preferred locale. Then operate from the language-specific section that matches the detected locale.

## Language Detection (F-46, upgraded 2026-05-28)

Apply this priority chain. Stop at the first match — that is the locale for this session.

1. **Current user turn contains ≥ 3 non-ASCII Chinese characters** → `locale=zh`.
2. **Current user turn is pure ASCII** (no CJK characters): provisionally `locale=en`, continue to step 3 for confirmation.
3. **Repository primary language**: Read `CLAUDE.md`, then `AGENTS.md`, then `README.md` at project root. CJK ratio ≥ 30% of the first 200 lines → `locale=zh`; else → `locale=en`.
4. **Environment** (`$LANG` / `$LC_ALL` starts with `zh_`) → `locale=zh`; else fall through.
5. **Fallback** → `locale=en`.

Re-run detection if the user's language changes mid-session. Pass `lang: locale` to every `get_sota_pack` / `submit_report` call. Schema keys and identifiers stay as-is in both locales.

---

## Operate from the section matching `locale`

- `locale=zh` → follow **「中文版」** (below).
- `locale=en` → follow **"English Version"** (further below).

Both sections contain the same playbook translated.

---

<!-- ============================================================ -->
<!-- ZH BODY — canonical (translation_source: zh)                    -->
<!-- ============================================================ -->

# 中文版

你是逻辑跃迁 Harness 持续升级执行剧本（v2.0）。**这不是另一套机制**——它就是 `/lorejump-optimize` 同款闭环再跑一次，区别只在：把上次的 `scan_report_id` 作为 hint 传给 server，server 在 `get_sota_pack` 响应的 `nudge` 字段返回 H1 diff digest 文本。

> ADR-013（2026-04-25）变更摘要见 `matchJobAI/技术架构/02-技术选型决策记录.md` §ADR-013 + `matchJobAI/mvp/00-核心产品机制设计.md` v2.0 §五.3。
>
> **不再做**：H2 peer band / H3 weekly email / H4 streak / H5 Wrapped / H6 PR decoration —— 全部违反 ADR-013 P5。仅保留 H1 diff digest，且作为 nudge 文本融入。

## 一次运行的闭环

```
[1 本地扫描 + 读上次 report_id]
    ↓
[2 get_sota_pack(since_report_id=last_scan_id, lang=zh)]   ← server 在 nudge 给 H1 diff
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
  lang: "zh",                           // F-46
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

调用 `submit_report(type="scan", body_md=..., parent=null, lang="zh")`，模板与 `/lorejump-optimize` Step 7 一致。`body_md` 顶部 frontmatter 加一行：

```yaml
trigger: harness_cycle    # 区别于交互式 /lorejump-optimize
last_cycle_at: <上次 cycle 日期 或 null>
```

## Stage 6 — Apply 闭环（保守 / --apply）

每个用户选中的候选项：

1. dry-run（Read 目标文件 + 输出 diff 预览）
2. **保守模式**：只展示 diff，不执行；将"未应用项"汇总到 `.lorejump/harness-cycle-YYYY-MM-DD.md` 的"待你决定"节
3. **--apply 模式**：用户确认 → 写文件 → 跑 verify（参 `/lorejump-optimize` Step 8）→ `submit_report(apply, parent=R1, lang="zh")`

**边界约束（客户侧安全）**：
- 不修改 `src/` 应用代码（harness 范畴外）
- 不修改 `.git/` / `node_modules/` / build 产物
- 尊重 `.claude/hooks/protect-files.sh` 的拦截
- `npm install -g ...` 等只输出，不代跑

## Stage 7 — R3 session_close

会话收尾调 `submit_report(type="session_close", parent=R1, lang="zh")`。同 `/lorejump-optimize` Step 9 模板。`body_md` 末尾加"下次 cycle 建议时间 = 今日 + 7 天"。

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

<!-- ============================================================ -->
<!-- EN BODY — translated (translation_source: zh, synced: 2026-05-28) -->
<!-- ============================================================ -->

# English Version

You are the LoreJump continuous harness upgrade playbook (v2.0). **This is not a separate mechanism** — it's the same loop as `/lorejump-optimize` run again, with one difference: pass the previous `scan_report_id` as a hint to the server, and the server returns an H1 diff digest in the `nudge` field of the `get_sota_pack` response.

> ADR-013 (2026-04-25) change summary: see `matchJobAI/技术架构/02-技术选型决策记录.md` §ADR-013 + `matchJobAI/mvp/00-核心产品机制设计.md` v2.0 §5.3.
>
> **No longer done**: H2 peer band / H3 weekly email / H4 streak / H5 Wrapped / H6 PR decoration — all violate ADR-013 P5. Only H1 diff digest is kept, embedded as nudge text.

## The loop, one run

```
[1 Local scan + read last report_id]
    ↓
[2 get_sota_pack(since_report_id=last_scan_id, lang=en)]   ← server fills H1 diff in nudge
    ↓
[3 Score against the SOTA picture (same as /lorejump-optimize Step 3)]
    ↓
[4 Diagnosis + Top N proposals + nudge rendering]
    ↓
[5 submit_report(scan, parent=null)]              ← R1
    ↓
[6 User picks → dry-run → confirm → write → verify → submit_report(apply, parent=R1)]   ← R2
    ↓
[7 submit_report(session_close, parent=R1)]                                              ← R3
    ↓
[8 Write local cycle report .lorejump/harness-cycle-YYYY-MM-DD.md]
```

**Recommended cadence**: once a week.

## Arguments

- No args: **conservative mode** (default) — Step 6 previews only, does not write files.
- `--apply`: **apply mode** — write files after user confirmation.
- `--since YYYY-MM-DD`: override default since-date (default reads latest scan date from `.lorejump/history.json`, or 7 days ago).
- `--deep`: Step 4 makes one extra WebFetch / Agent(Explore) for cross-validation (+5 min).

## Stage 1 — Local scan (< 20s, parallel)

Reference `/lorejump-optimize` Step 1 for full fingerprint collection. **Additionally**:

- Read `.lorejump/history.json`; take `report_id` of `scans[latest]` (v3+ history should record this field; if missing, treat as first run).
- Read `.lorejump/harness-cycle-last.txt` (treat as first run if missing).
- Last scan date → `since` (default).

## Stage 2 — get_sota_pack (one call to fetch everything)

```
get_sota_pack({
  project_type,
  stack_signature,
  project_fingerprint,                  // includes dimensions (from previous scan's history)
  since_report_id: <from history>,      // lets server compute H1 diff digest
  since: <last scan date>,              // filters recent_practices
  max_recent_practices: 20,
  max_applicable_gaps: 10,
  lang: "en",                           // F-46
})
```

**Render the server's `nudge` field directly** — it's already the H1 diff digest text ("12 days since last scan; 3 new practices match your stack"). The skill does NOT compute the diff locally.

**MCP unreachable**: fall back to other lorejump entries in local `.mcp.json`; if still failing → guide the user to `/install` and exit (do not run Stage 3+).

## Stage 3 — Score against the SOTA picture

Fully reuses `/lorejump-optimize` Step 3's "semantic match + self-confidence" scoring.
**Do not hard-code scoring formulas in the harness** — same SKILL.md pattern (IP centralized).

## Stage 4 — Diagnosis + Top N proposals

Reference `/lorejump-optimize` Step 5's report format. **Additionally**:

- Render the nudge text (H1 diff digest) at the top of the report.
- Sort `applicable_gaps` by priority, take Top 5 as this cycle's candidates.
- If `--deep`, call `WebFetch <source_url>` once for the top item to pull the original and append 1-2 key sentences to the proposal description.
- Other deep calls (Agent Explore / multi-WebFetch) are output as **suggestion blocks** for the user; **the skill does not run them on the user's behalf**.

## Stage 5 — R1 scan report

Call `submit_report(type="scan", body_md=..., parent=null, lang="en")`. Template identical to `/lorejump-optimize` Step 7. `body_md` frontmatter gains one line at the top:

```yaml
trigger: harness_cycle    # distinguishes from interactive /lorejump-optimize
last_cycle_at: <last cycle date or null>
```

## Stage 6 — Apply loop (conservative / --apply)

For each user-selected candidate:

1. Dry-run (Read target file + output diff preview).
2. **Conservative mode**: show diff only, do not execute; collect "unapplied items" under the "For your decision" section of `.lorejump/harness-cycle-YYYY-MM-DD.md`.
3. **--apply mode**: user confirms → write files → run verify (see `/lorejump-optimize` Step 8) → `submit_report(apply, parent=R1, lang="en")`.

**Boundary constraints (client-side safety)**:
- Do not modify `src/` application code (out of harness scope).
- Do not modify `.git/` / `node_modules/` / build artifacts.
- Honor `.claude/hooks/protect-files.sh` interception.
- `npm install -g ...` and similar are output only, never executed.

## Stage 7 — R3 session_close

At session wrap-up, call `submit_report(type="session_close", parent=R1, lang="en")`. Same template as `/lorejump-optimize` Step 9. `body_md` ends with "Next cycle suggested = today + 7 days".

## Stage 8 — Local cycle report

Write `.lorejump/harness-cycle-YYYY-MM-DD.md`:

```markdown
# LoreJump Harness Cycle — YYYY-MM-DD

## SOTA Pack summary
- pack_version: <>
- nudge: <H1 diff digest verbatim>

## This cycle's candidates (Top N from applicable_gaps)
| ID | Title | priority | Status |
|----|-------|----------|--------|

## Applied (R2 apply)
- [<id>] <title> — verify=<status>

## Skipped / pending
- [<id>] <title> — Reason: <>

## Next suggestion
<1-2 sentences>
```

Also update `.lorejump/harness-cycle-last.txt = <today>`.

## Terminal recap

```
✅ LoreJump Harness Cycle complete — YYYY-MM-DD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Candidates N / Applied X / Skipped Y / Pending Z

nudge: <single-line H1 diff digest>

📄 Full report: .lorejump/harness-cycle-YYYY-MM-DD.md
🔄 Next suggested: <today + 7 days>
```

## DLP

Same as `/lorejump-optimize`. Before submission, filter `project_group_id` / `body_md` for raw paths / git remote / code snippets / secret matches.

## Failure handling

| Problem | Handling |
|---------|----------|
| MCP unreachable | Exit at Stage 2, guide to `/install` |
| `.lorejump/history.json` missing | `fingerprint.dimensions = {}`, can still produce SOTA pack |
| Some `entry_id` superseded | Server should return new id; skill skips old id and flags "deprecated, suggest re-run" in report |
| `--apply` item verify fails | Mark that item `verify_status=fail` but continue others; final report flags it red |
| Supabase R1/R2/R3 write fails | Skill caches to `.lorejump/report-queue.json`, merges and retries next cycle |

## Core rules

- **Three-way separation**: skill = playbook / MCP = SOTA knowledge source + inbox / agent = generic executor.
- **Single source of truth**: all SOTA data only from `get_sota_pack`; do not assume lorejump's internal KB location.
- **Client decides all external actions**: WebFetch / Agent / shell commands are suggestion blocks; the skill only does file edits.
- **Conservative by default**: without `--apply`, preview only.
- **Reentrant**: same-day re-run does not re-apply already-applied items (dedup via `.lorejump/history.json.scans[latest].applied_practice_keys`).

---

## Changelog

- v2.2 (2026-05-28): Bilingual body split (中文 + English in one SKILL.md). Language Detection priority chain upgraded (P3 active per spec i18n-bilingual).
- v2.1 (2026-05-13): Initial Language Detection segment + bilingual description.
- v2.0 (2026-04-25): ADR-013 rewrite. Collapsed 7 legacy MCP tool calls → 1 `get_sota_pack`; H1-H6 retention mechanism → only H1 nudge text; apply goes through R2 + verify; session_close goes through R3. Removed the old DeepResearch multi-step suggestion-block stage division (kept `--deep` option as a single WebFetch enhancement).
- v1.0 (2026-04-13): Phase Harness-v1 first version (H1-H6 multi-mechanism).

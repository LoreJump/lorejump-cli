import { readFile } from "node:fs/promises";
import { safeWrite } from "./fs-safe.js";

/**
 * Idempotent merge of a fenced markdown section into a target file.
 *
 * Used for agents whose instruction layer is a single user-edited markdown
 * file (Codex's AGENTS.md, Antigravity's AGENTS.md). We can't overwrite the
 * file — the user owns it. We append our skill content inside a clearly
 * marked fence and replace just that fence on update.
 *
 * Fence format:
 *   <!-- BEGIN LOREJUMP <id> -->
 *   <markdown body>
 *   <!-- END LOREJUMP <id> -->
 *
 * The id should be stable across runs (e.g. "skill:lorejump-optimize") so
 * `lorejump update` finds and replaces the right block.
 */
export async function mergeFencedSection(args: {
  path: string;
  id: string;
  body: string;
}): Promise<{ wasNew: boolean }> {
  const { path, id, body } = args;
  const begin = `<!-- BEGIN LOREJUMP ${id} -->`;
  const end = `<!-- END LOREJUMP ${id} -->`;
  const block = `${begin}\n${body.trimEnd()}\n${end}`;

  let existing: string;
  try {
    existing = await readFile(path, "utf-8");
  } catch {
    // File missing — create with just our block.
    await safeWrite(path, `${block}\n`);
    return { wasNew: true };
  }

  // Replace existing fenced section if present.
  const beginIdx = existing.indexOf(begin);
  if (beginIdx !== -1) {
    const endIdx = existing.indexOf(end, beginIdx);
    if (endIdx !== -1) {
      const before = existing.slice(0, beginIdx);
      const after = existing.slice(endIdx + end.length);
      const next = `${before}${block}${after}`;
      if (next !== existing) await safeWrite(path, next);
      return { wasNew: false };
    }
    // BEGIN without END — corrupted; append fresh block at EOF rather than
    // try to repair (preserves user's malformed content for them to fix).
  }

  // Append at EOF with a leading blank line if file doesn't already end with one.
  const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  await safeWrite(path, `${existing}${sep}${block}\n`);
  return { wasNew: false };
}

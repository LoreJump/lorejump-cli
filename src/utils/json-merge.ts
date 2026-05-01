import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { readFile } from "node:fs/promises";
import { safeWrite } from "./fs-safe.js";

export interface JsonMergeResult {
  preservedExisting: string[];
  wasNew: boolean;
}

/**
 * Idempotent merge of a single named entry into a JSON / JSONC config file.
 *
 * Preserves comments, formatting, and ordering of all unrelated keys.
 * Returns the names of sibling entries already in the target object (so the
 * caller can record `preserved_existing` in install-log.json).
 *
 * If the file does not exist, creates it with `{ [rootKey]: { [name]: value } }`.
 *
 * If the user has manually edited the entry's content (e.g. changed url),
 * the existing value is preserved — caller decides whether to warn.
 */
export async function mergeJsonEntry(args: {
  path: string;
  rootKey: string;
  entryName: string;
  entryValue: Record<string, unknown>;
  preserveUserEdit?: boolean;
}): Promise<JsonMergeResult> {
  const { path, rootKey, entryName, entryValue, preserveUserEdit = true } = args;

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const initial = { [rootKey]: { [entryName]: entryValue } };
      await safeWrite(path, JSON.stringify(initial, null, 2) + "\n");
      return { preservedExisting: [], wasNew: true };
    }
    throw err;
  }

  const errors: ParseError[] = [];
  const parsed = parse(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(
      `Failed to parse ${path}: ${errors.length} JSONC parse error(s). ` +
        `Please back up and fix the file manually before re-running.`,
    );
  }

  const existingRoot = (parsed?.[rootKey] ?? {}) as Record<string, unknown>;
  const existingNames = Object.keys(existingRoot);
  const preservedExisting = existingNames.filter((n) => n !== entryName);

  const userAlreadyHasEntry = entryName in existingRoot;
  if (userAlreadyHasEntry && preserveUserEdit) {
    // Don't overwrite user customizations to the lorejump entry.
    return { preservedExisting, wasNew: false };
  }

  let updated = raw;
  if (!parsed || typeof parsed !== "object" || !(rootKey in parsed)) {
    const edits = modify(updated, [rootKey], { [entryName]: entryValue }, {
      formattingOptions: { tabSize: 2, insertSpaces: true },
    });
    updated = applyEdits(updated, edits);
  } else {
    const edits = modify(updated, [rootKey, entryName], entryValue, {
      formattingOptions: { tabSize: 2, insertSpaces: true },
    });
    updated = applyEdits(updated, edits);
  }

  await safeWrite(path, updated);
  return { preservedExisting, wasNew: !userAlreadyHasEntry };
}

import toml from "@iarna/toml";
import { readFile } from "node:fs/promises";
import { safeWrite } from "./fs-safe.js";

export interface TomlMergeResult {
  preservedExisting: string[];
  wasNew: boolean;
}

/**
 * Merge a single named entry into a TOML config file.
 *
 * For Codex CLI: rootKey="mcp_servers" produces `[mcp_servers.<name>]` blocks
 * (snake_case singular, dotted-key inline table — confirmed against
 * github.com/openai/codex/blob/main/docs/config.md).
 *
 * Note: @iarna/toml does NOT preserve comments. Codex's config.toml is
 * usually CLI-generated (not hand-edited with comments), so this is
 * acceptable. If users have hand-comments and need them preserved, they
 * must back up before running install.
 */
export async function mergeTomlEntry(args: {
  path: string;
  rootKey: string;
  entryName: string;
  entryValue: Record<string, unknown>;
  preserveUserEdit?: boolean;
}): Promise<TomlMergeResult> {
  const { path, rootKey, entryName, entryValue, preserveUserEdit = true } = args;

  let raw = "";
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  let parsed: Record<string, unknown> = {};
  if (raw.length > 0) {
    try {
      parsed = toml.parse(raw) as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `Failed to parse ${path}: ${(err as Error).message}. ` +
          `Please back up and fix the file manually before re-running.`,
      );
    }
  }

  const existingRoot = (parsed[rootKey] ?? {}) as Record<string, unknown>;
  const existingNames = Object.keys(existingRoot);
  const preservedExisting = existingNames.filter((n) => n !== entryName);

  const userAlreadyHasEntry = entryName in existingRoot;
  if (userAlreadyHasEntry && preserveUserEdit) {
    return { preservedExisting, wasNew: false };
  }

  parsed[rootKey] = { ...existingRoot, [entryName]: entryValue };

  const out = toml.stringify(parsed as toml.JsonMap);
  await safeWrite(path, out);
  return { preservedExisting, wasNew: !userAlreadyHasEntry };
}

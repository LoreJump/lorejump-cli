import yaml from "js-yaml";
import { readFile } from "node:fs/promises";
import { safeWrite } from "./fs-safe.js";

export interface YamlMergeResult {
  preservedExisting: string[];
  wasNew: boolean;
}

/**
 * Merge a single named entry into a YAML config file.
 *
 * For hermes-agent: rootKey="mcp_servers" (snake_case, per
 * github.com/NousResearch/hermes-agent's config.yaml convention).
 *
 * Note: js-yaml does NOT preserve comments. Hermes config.yaml is often
 * hand-edited; warn users in install output that comments may be lost.
 */
export async function mergeYamlEntry(args: {
  path: string;
  rootKey: string;
  entryName: string;
  entryValue: Record<string, unknown>;
  preserveUserEdit?: boolean;
}): Promise<YamlMergeResult> {
  const { path, rootKey, entryName, entryValue, preserveUserEdit = true } = args;

  let raw = "";
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  let parsed: Record<string, unknown> = {};
  if (raw.trim().length > 0) {
    try {
      const loaded = yaml.load(raw);
      if (loaded && typeof loaded === "object") {
        parsed = loaded as Record<string, unknown>;
      }
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

  const out = yaml.dump(parsed, { indent: 2, lineWidth: 100, noRefs: true });
  await safeWrite(path, out);
  return { preservedExisting, wasNew: !userAlreadyHasEntry };
}

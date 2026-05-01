import type { Adapter } from "./_types.js";
import { claudeCode } from "./claude-code.js";
import { cursor } from "./cursor.js";
import { trae } from "./trae.js";

export const ADAPTERS: readonly Adapter[] = [claudeCode, cursor, trae];

export const ADAPTERS_BY_ID: Record<string, Adapter> = Object.fromEntries(
  ADAPTERS.map((a) => [a.id, a]),
);

export type { Adapter, AdapterContext, McpEntry, InstalledTarget } from "./_types.js";

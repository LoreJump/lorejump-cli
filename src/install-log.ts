import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { INSTALL_LOG_DIR, INSTALL_LOG_PATH } from "./constants.js";
import type { InstalledTarget } from "./adapters/_types.js";

export interface InstallLog {
  cli_version: string;
  first_install_at: string;
  last_update_at: string;
  targets: InstalledTarget[];
}

export async function readInstallLog(): Promise<InstallLog | null> {
  try {
    const raw = await readFile(INSTALL_LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as InstallLog;
    if (!parsed || !Array.isArray(parsed.targets)) return null;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeInstallLog(log: InstallLog): Promise<void> {
  await mkdir(dirname(INSTALL_LOG_PATH), { recursive: true });
  const tmp = `${INSTALL_LOG_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(log, null, 2) + "\n", "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, INSTALL_LOG_PATH);
}

export async function ensureInstallLogDir(): Promise<void> {
  await mkdir(INSTALL_LOG_DIR, { recursive: true });
}

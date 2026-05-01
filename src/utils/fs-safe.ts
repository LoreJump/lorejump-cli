import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

/**
 * Atomic write: write to <path>.tmp then rename. Avoids torn writes if the
 * process crashes mid-write. Caller is responsible for ensuring the parent
 * directory exists (or pass `mkdirParent: true`).
 */
export async function atomicWrite(
  path: string,
  content: string | Uint8Array,
  opts: { mkdirParent?: boolean } = {},
): Promise<void> {
  if (opts.mkdirParent) {
    await mkdir(dirname(path), { recursive: true });
  }
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}

export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export class PermissionDeniedError extends Error {
  constructor(path: string, cause?: unknown) {
    super(
      `Permission denied: ${path}\n` +
        `  Fix: ensure your agent or shell has write access to this path.\n` +
        `  Alternative: rerun with --tool=<name> to target a different agent.`,
    );
    this.name = "PermissionDeniedError";
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export async function safeWrite(
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  try {
    await atomicWrite(path, content, { mkdirParent: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new PermissionDeniedError(path, err);
    }
    throw err;
  }
}

import pc from "picocolors";
import { CLI_NAME, LATEST_JSON_URL, VERSION_CHECK_TIMEOUT_MS } from "./constants.js";

interface LatestManifest {
  version: string;
  sha256?: string;
  released_at?: string;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

async function fetchLatestVersion(currentVersion: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VERSION_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(LATEST_JSON_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": `lorejump-cli/${currentVersion}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LatestManifest;
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runVersionNudge(
  currentVersion: string,
  skip?: boolean,
): Promise<void> {
  if (skip) return;
  const latest = await fetchLatestVersion(currentVersion);
  if (!latest) return;
  if (compareSemver(latest, currentVersion) <= 0) return;

  console.log("");
  console.log(
    pc.cyan(
      `🆕 ${CLI_NAME} ${currentVersion} → ${latest} available`,
    ),
  );
  console.log(
    pc.dim(
      `   Upgrade: npm i -g ${CLI_NAME}@latest  (or rerun: curl -fsSL https://lorejump.com/install.sh | bash)`,
    ),
  );
}

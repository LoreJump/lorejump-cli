import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const CLI_NAME = "@lorejump/cli";

export const MCP_SERVER_URL = "https://mcp.lorejump.com/mcp";

export const LATEST_JSON_URL = "https://lorejump.com/cli/latest.json";

export const VERSION_CHECK_TIMEOUT_MS = 5_000;

export const INSTALL_LOG_DIR = join(homedir(), ".lorejump");
export const INSTALL_LOG_PATH = join(INSTALL_LOG_DIR, "install-log.json");

export const HANDOFF_DIR = join(tmpdir(), "lorejump-handoff");

export const SKILL_NAMES = ["lorejump-optimize", "lorejump-harness"] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

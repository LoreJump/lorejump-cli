/**
 * MCP Streamable HTTP handshake probe.
 *
 * Used by both `install` (record handshake at install time) and `doctor`
 * (verify the server is still healthy and exposes the expected tools).
 *
 * Why we don't reuse @modelcontextprotocol/sdk's client transport:
 *   - The SDK transport pulls in WebSocket / SSE machinery we don't need.
 *   - We just want a 2-call probe (initialize + tools/list) with tight
 *     timeouts and explicit failure modes for the doctor report.
 */

export interface HandshakeResult {
  ok: boolean;
  /** Human-readable summary, used by doctor's printCheck. */
  detail: string;
  /** Server identification from initialize, when reachable. */
  serverInfo?: { name: string; version: string };
  /** Tool names from tools/list, when reachable. */
  tools?: string[];
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc?: "2.0";
  id?: number | string | null;
  result?: T;
  error?: { code: number; message: string };
}

const DEFAULT_TIMEOUT_MS = 8_000;

export async function mcpHandshake(
  endpoint: string,
  opts?: { timeoutMs?: number; expectedTools?: string[] },
): Promise<HandshakeResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const expected = opts?.expectedTools ?? ["get_sota_pack", "submit_report"];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    // 1) initialize — minimal client info, protocolVersion matches lorejump-mcp v2.
    const initRes = await fetch(endpoint, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "lorejump-cli-doctor", version: "1.0" },
        },
      }),
    });

    if (!initRes.ok) {
      return {
        ok: false,
        detail: `initialize HTTP ${initRes.status} (server not speaking MCP at ${endpoint})`,
      };
    }

    const initBody = (await initRes.json()) as JsonRpcResponse<{
      protocolVersion?: string;
      serverInfo?: { name: string; version: string };
    }>;

    if (initBody.error) {
      return {
        ok: false,
        detail: `initialize error -${initBody.error.code}: ${initBody.error.message}`,
      };
    }
    const serverInfo = initBody.result?.serverInfo;
    if (!serverInfo) {
      return { ok: false, detail: "initialize returned no serverInfo" };
    }

    // 2) tools/list — confirm expected tools are exposed (not just any tools).
    const sid = initRes.headers.get("mcp-session-id") ?? null;
    const toolsRes = await fetch(endpoint, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sid ? { "mcp-session-id": sid } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    if (!toolsRes.ok) {
      return {
        ok: false,
        detail: `tools/list HTTP ${toolsRes.status} after successful initialize`,
        serverInfo,
      };
    }
    const toolsBody = (await toolsRes.json()) as JsonRpcResponse<{
      tools?: { name: string }[];
    }>;
    if (toolsBody.error) {
      return {
        ok: false,
        detail: `tools/list error -${toolsBody.error.code}: ${toolsBody.error.message}`,
        serverInfo,
      };
    }
    const toolNames = (toolsBody.result?.tools ?? []).map((t) => t.name);
    const missing = expected.filter((n) => !toolNames.includes(n));
    if (missing.length > 0) {
      return {
        ok: false,
        detail: `missing tools: ${missing.join(", ")} (got: ${toolNames.join(", ") || "none"})`,
        serverInfo,
        tools: toolNames,
      };
    }

    return {
      ok: true,
      detail: `${serverInfo.name} v${serverInfo.version} · tools: ${toolNames.join(", ")}`,
      serverInfo,
      tools: toolNames,
    };
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
    return { ok: false, detail: `handshake failed: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

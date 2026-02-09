/**
 * Helper to connect to a remote MCP server (agent endpoint), call listTools or callTool, then close.
 * Tries Streamable HTTP first, then SSE for backwards compatibility.
 * When the SDK rejects agent response (e.g. invalid content schema), falls back to raw HTTP tools/call and normalizes content.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

/** Normalize possibly malformed MCP content from agents into valid text content items. */
function normalizeToolContent(content: unknown[]): Array<{ type: "text"; text: string }> {
  return content.map((item) => {
    if (item != null && typeof item === "object" && "type" in item && (item as { type: string }).type === "text") {
      const text = (item as { text?: unknown }).text;
      return { type: "text" as const, text: typeof text === "string" ? text : JSON.stringify(text ?? item) };
    }
    return { type: "text" as const, text: JSON.stringify(item) };
  });
}

/** Raw HTTP tools/call to agent endpoint; no response schema validation. Returns normalized content. */
async function callRemoteToolRaw(
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<{ content: Array<{ type: "text"; text: string }>; isError: boolean }> {
  const url = new URL(endpoint);
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body,
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Raw tools/call failed: ${res.status} ${res.statusText}`);
    const contentType = res.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      const text = await res.text();
      return { content: [{ type: "text", text: text || `Unexpected content-type: ${contentType}` }], isError: true };
    }
    const data = (await res.json()) as { result?: { content?: unknown[]; isError?: boolean }; error?: { message?: string } };
    if (data.error) {
      return {
        content: [{ type: "text", text: data.error.message ?? JSON.stringify(data.error) }],
        isError: true,
      };
    }
    const rawContent = Array.isArray(data.result?.content) ? data.result.content : [];
    const isError = data.result?.isError === true;
    return { content: normalizeToolContent(rawContent), isError };
  } finally {
    clearTimeout(t);
  }
}

export interface RemoteTool {
  name: string;
  description?: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

async function connectToAgent(endpoint: string): Promise<{ client: Client; transport: { close(): Promise<void> } }> {
  const url = new URL(endpoint);
  const client = new Client({ name: "erc8004-control-plane", version: "0.1.0" });

  try {
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    return { client, transport };
  } catch {
    const transport = new SSEClientTransport(url);
    await client.connect(transport);
    return { client, transport };
  }
}

export async function fetchRemoteTools(endpoint: string): Promise<RemoteTool[]> {
  const { client, transport } = await connectToAgent(endpoint);
  try {
    const result = await client.listTools();
    const tools = result.tools ?? [];
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? { type: "object" as const, properties: {}, required: [] },
      annotations: t.annotations,
    }));
  } finally {
    await transport.close();
  }
}

export async function callRemoteTool(
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<{ content: unknown[]; isError?: boolean }> {
  try {
    const { client, transport } = await connectToAgent(endpoint);
    try {
      const result = await client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { signal: AbortSignal.timeout(timeoutMs) }
      );
      const content = (result as { content?: unknown[] }).content ?? [];
      const isError = (result as { isError?: boolean }).isError;
      return { content, isError };
    } finally {
      await transport.close();
    }
  } catch {
    return callRemoteToolRaw(endpoint, toolName, args, timeoutMs);
  }
}

/** Synthesized tool ID format: agent_id::tool_name */
export function toSynthesizedId(agentId: number, toolName: string): string {
  return `${agentId}::${toolName}`;
}

export function parseSynthesizedId(toolId: string): { agentId: number; toolName: string } | null {
  const i = toolId.indexOf("::");
  if (i <= 0 || i === toolId.length - 1) return null;
  const agentId = Number(toolId.slice(0, i));
  const toolName = toolId.slice(i + 2);
  if (Number.isNaN(agentId) || !toolName) return null;
  return { agentId, toolName };
}

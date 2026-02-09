/**
 * MCP tool: invoke — proxy a tool call to the remote agent, enforce policy/timeout/rate limit, emit receipt.
 */

import { createHash } from "node:crypto";
import { whoami } from "./whoami.js";
import { resolveAgent } from "./resolve_agent.js";
import { getAgentMcpEndpoint, getMcpEndpointFromServices } from "../resolver/mcp-endpoint.js";
import { agentPassesPolicy, getToolRiskClass, riskClassAllowed } from "../policy/filter.js";
import { getPolicyConfig } from "../policy/config.js";
import { createReceipt, updateReceiptOutcome } from "../receipts/store.js";
import {
  parseSynthesizedId,
  callRemoteTool,
  fetchRemoteTools,
} from "./mcp-client-helper.js";

export const name = "invoke";
export const description =
  "Proxy a tool call to the remote agent. Requires synthesized tool_id (from list_tools) and arguments. Enforces policy, timeout, and rate limit; emits an execution receipt.";

export interface InvokeArgs {
  tool_id: string;
  args: Record<string, unknown>;
}

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(principal: string): void {
  const policy = getPolicyConfig();
  if (policy.rateLimitPerMinute <= 0) return;

  const now = Date.now();
  let entry = rateLimitMap.get(principal);
  if (!entry) {
    rateLimitMap.set(principal, { count: 1, windowStart: now });
    return;
  }
  if (now - entry.windowStart >= RATE_WINDOW_MS) {
    entry = { count: 1, windowStart: now };
    rateLimitMap.set(principal, entry);
    return;
  }
  entry.count++;
  if (entry.count > policy.rateLimitPerMinute) {
    throw new Error(
      `Rate limit exceeded: ${policy.rateLimitPerMinute} invocations per minute for principal ${principal}`
    );
  }
}

function digest(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 32);
}

export async function invokeTool(args: InvokeArgs): Promise<{
  receipt_id: string;
  outcome: "ok" | "error";
  content?: unknown[];
  error_message?: string;
}> {
  const { principal } = whoami();
  if (!principal) throw new Error("Principal required for invoke");

  checkRateLimit(principal);

  const parsed = parseSynthesizedId(args.tool_id);
  if (!parsed) throw new Error(`Invalid tool_id: ${args.tool_id}. Expected format agent_id::tool_name`);

  const { agentId, toolName } = parsed;

  const { card, trust } = await resolveAgent({ agent_id: agentId });
  if (!agentPassesPolicy(trust)) throw new Error(`Agent ${agentId} does not pass policy`);

  const endpoint =
    getMcpEndpointFromServices(card.services ?? []) ??
    (await getAgentMcpEndpoint(agentId));
  if (!endpoint) throw new Error(`No MCP endpoint for agent ${agentId}`);

  const remoteTools = await fetchRemoteTools(endpoint);
  const toolMeta = remoteTools.find((t) => t.name === toolName);
  if (!toolMeta) throw new Error(`Tool ${toolName} not found on agent ${agentId}`);
  const riskClass = getToolRiskClass(toolMeta.annotations);
  if (!riskClassAllowed(riskClass)) throw new Error(`Tool risk class ${riskClass} not allowed by policy`);

  const policy = getPolicyConfig();
  const argsDigest = digest(args.args);
  const receipt = createReceipt(principal, agentId, toolName, args.tool_id, argsDigest);

  try {
    const result = await callRemoteTool(endpoint, toolName, args.args, policy.invokeTimeoutMs);
    const resultDigest = digest(result.content);
    updateReceiptOutcome(receipt.receipt_id, result.isError ? "error" : "ok", resultDigest, null);
    return {
      receipt_id: receipt.receipt_id,
      outcome: result.isError ? "error" : "ok",
      content: result.content,
      ...(result.isError && { error_message: String((result.content?.[0] as { text?: string })?.text ?? "Tool returned error") }),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    updateReceiptOutcome(receipt.receipt_id, "error", null, errorMessage);
    return {
      receipt_id: receipt.receipt_id,
      outcome: "error",
      error_message: errorMessage,
    };
  }
}

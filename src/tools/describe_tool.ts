/**
 * MCP tool: describe_tool — explain tool provenance, risk, and trust for a synthesized tool ID.
 */

import { resolveAgent } from "./resolve_agent.js";
import { getAgentMcpEndpoint } from "../resolver/mcp-endpoint.js";
import { fetchRemoteTools, parseSynthesizedId } from "./mcp-client-helper.js";
import { getToolRiskClass } from "../policy/filter.js";

export const name = "describe_tool";
export const description =
  "Explain tool provenance (agent, registry), risk class, and trust summary for a synthesized tool ID (from list_tools).";

export interface DescribeToolArgs {
  tool_id: string;
}

export interface DescribeToolResult {
  tool_id: string;
  agent_id: number;
  tool_name: string;
  provenance: { agent_id: number; name: string; agentRegistry: string };
  risk: { risk_class: "read_only" | "side_effecting"; readOnlyHint?: boolean; destructiveHint?: boolean };
  trust: { validationCount: number; feedbackCount: number; summaryValue?: number };
}

export async function describeTool(args: DescribeToolArgs): Promise<DescribeToolResult> {
  const parsed = parseSynthesizedId(args.tool_id);
  if (!parsed) throw new Error(`Invalid tool_id: ${args.tool_id}. Expected format agent_id::tool_name`);

  const { agentId, toolName } = parsed;
  const { card, trust } = await resolveAgent({ agent_id: agentId });

  const endpoint = await getAgentMcpEndpoint(agentId).catch(() => null);
  let readOnlyHint: boolean | undefined;
  let destructiveHint: boolean | undefined;
  if (endpoint) {
    try {
      const remoteTools = await fetchRemoteTools(endpoint);
      const t = remoteTools.find((r) => r.name === toolName);
      if (t?.annotations) {
        readOnlyHint = t.annotations.readOnlyHint;
        destructiveHint = t.annotations.destructiveHint;
      }
    } catch {
      // use defaults
    }
  }

  const riskClass = getToolRiskClass({ readOnlyHint, destructiveHint });

  return {
    tool_id: args.tool_id,
    agent_id: agentId,
    tool_name: toolName,
    provenance: {
      agent_id: card.agentId,
      name: card.name,
      agentRegistry: card.agentRegistry,
    },
    risk: {
      risk_class: riskClass,
      readOnlyHint,
      destructiveHint,
    },
    trust: {
      validationCount: trust.validationCount ?? 0,
      feedbackCount: trust.feedbackCount ?? 0,
      summaryValue: trust.summaryValue,
    },
  };
}

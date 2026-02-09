/**
 * MCP tool: resolve_agent(agent_id) → Agent Card + trust summary.
 * When SUBGRAPH_URL is set, uses subgraph GetCompleteAgentDetails (agent0lab/subgraph).
 * When the agent has an MCP endpoint, connects automatically and returns mcp_* fields.
 */

import { getReputationSummary, getValidationSummary } from "../registry/adapter.js";
import { resolveAgentCard } from "../resolver/agent-card.js";
import { getMcpEndpointFromServices } from "../resolver/mcp-endpoint.js";
import { agentPassesPolicy } from "../policy/filter.js";
import { fetchRemoteTools } from "./mcp-client-helper.js";
import {
  getSubgraphUrl,
  getCompleteAgentDetails,
  fullAgentToCardAndTrust,
} from "../subgraph/index.js";
import type { TrustSummary } from "../types/schemas.js";
import { chainId } from "../../config/chain.js";

export const name = "resolve_agent";
export const description =
  "Resolve an agent by ID. Returns the Agent Card (capabilities, endpoints, pricing, terms) and a trust summary (reputation and validation counts).";

export const argsSchema = {
  type: "object" as const,
  properties: {
    agent_id: {
      type: "number",
      description: "ERC-8004 agent ID (tokenId from Identity Registry).",
    },
  },
  required: ["agent_id"],
  additionalProperties: false,
};

export interface ResolveAgentArgs {
  agent_id: number;
}

export async function resolveAgent(args: ResolveAgentArgs): Promise<{
  card: ReturnType<typeof serializeCard>;
  trust: TrustSummary;
  mcp_endpoint?: string | null;
  mcp_connected?: boolean;
  mcp_tool_count?: number;
  mcp_tool_names?: string[];
}> {
  const { agent_id } = args;
  let card: import("../types/schemas.js").AgentCard;
  let trust: TrustSummary;

  if (getSubgraphUrl() != null) {
    const agent = await getCompleteAgentDetails(agent_id, chainId);
    if (agent) {
      const out = fullAgentToCardAndTrust(agent);
      card = out.card;
      trust = out.trust;
      const result = { card: serializeCard(card), trust };
      return addMcpConnectionIfPresent(result, card, trust);
    }
    // Agent not in subgraph (e.g. other chain); fall back to chain resolve
  }

  card = await resolveAgentCard(agent_id);
  const agentIdBigInt = BigInt(agent_id);
  const [reputation, validation] = await Promise.all([
    getReputationSummary(agentIdBigInt).catch(() => ({
      count: 0,
      summaryValue: 0,
      summaryValueDecimals: 0,
    })),
    getValidationSummary(agentIdBigInt).catch(() => ({
      count: 0,
      averageResponse: 0,
    })),
  ]);
  trust = {
    validationCount: validation.count,
    averageValidationResponse:
      validation.count > 0 ? validation.averageResponse : undefined,
    feedbackCount: reputation.count,
    summaryValue:
      reputation.count > 0 ? reputation.summaryValue : undefined,
    summaryValueDecimals:
      reputation.count > 0 ? reputation.summaryValueDecimals : undefined,
  };
  const result = { card: serializeCard(card), trust };
  return addMcpConnectionIfPresent(result, card, trust);
}

/** When agent has an MCP endpoint and passes policy, connect automatically and add mcp_* fields. */
async function addMcpConnectionIfPresent(
  result: { card: ReturnType<typeof serializeCard>; trust: TrustSummary },
  card: import("../types/schemas.js").AgentCard,
  trust: TrustSummary
): Promise<{
  card: ReturnType<typeof serializeCard>;
  trust: TrustSummary;
  mcp_endpoint?: string | null;
  mcp_connected?: boolean;
  mcp_tool_count?: number;
  mcp_tool_names?: string[];
}> {
  const endpoint = getMcpEndpointFromServices(card.services ?? []);
  if (!endpoint) return result;
  if (!agentPassesPolicy(trust)) {
    return { ...result, mcp_endpoint: endpoint, mcp_connected: false };
  }
  try {
    const tools = await fetchRemoteTools(endpoint);
    return {
      ...result,
      mcp_endpoint: endpoint,
      mcp_connected: true,
      mcp_tool_count: tools.length,
      mcp_tool_names: tools.map((t) => t.name),
    };
  } catch {
    return { ...result, mcp_endpoint: endpoint, mcp_connected: false };
  }
}

function serializeCard(card: import("../types/schemas.js").AgentCard) {
  return {
    agentId: card.agentId,
    agentRegistry: card.agentRegistry,
    name: card.name,
    description: card.description,
    capabilities: card.capabilities,
    services: card.services.map((s) => ({
      name: s.name,
      endpoint: s.endpoint,
      version: s.version,
    })),
    verification_supported: card.verification_supported,
    payment_methods: card.payment_methods,
    supportedTrust: card.supportedTrust,
    x402Support: card.x402Support,
    active: card.active,
  };
}

/**
 * MCP tool: search_agents(filters) → ranked list of agents with "why" explanation.
 * When SUBGRAPH_URL is set, agents are discovered via subgraph GetAllMCPAgents (agent0lab/subgraph).
 * Otherwise agents are discovered by scanning chain events (current chain only).
 */

import { getAgentIds } from "../registry/adapter.js";
import { getReputationSummary, getValidationSummary } from "../registry/adapter.js";
import { resolveAgentCard } from "../resolver/agent-card.js";
import { getMcpEndpointFromCard } from "../resolver/mcp-endpoint.js";
import { getSubgraphUrl, getAllMCPAgents, subgraphAgentToAgentCard } from "../subgraph/index.js";
import type { AgentCard, SearchAgentsFilters, TrustSummary } from "../types/schemas.js";
import { chainId } from "../../config/chain.js";

export const name = "search_agents";
export const description =
  "Search and rank agents by capability and trust. Returns a list of agents matching filters (e.g. capability, min_reputation, min_validations) with a short explanation of why each was ranked.";

export const argsSchema = {
  type: "object" as const,
  properties: {
    capability: {
      type: "string",
      description: "Filter by capability (text match on agent card description/capabilities).",
    },
    min_reputation: {
      type: "number",
      description: "Minimum reputation summary value (0-100 scale if using valueDecimals 0).",
    },
    min_validations: {
      type: "number",
      description: "Minimum number of validation responses for the agent.",
    },
    supported_trust: {
      type: "array",
      items: { type: "string" },
      description: "Filter by supportedTrust (e.g. reputation, crypto-economic, tee-attestation).",
    },
    limit: {
      type: "number",
      description: "Max number of agents to return (default 20).",
    },
  },
  additionalProperties: false,
};

export interface SearchAgentsArgs {
  capability?: string;
  min_reputation?: number;
  min_validations?: number;
  supported_trust?: string[];
  limit?: number;
}

export interface RankedAgent {
  agent_id: number;
  /** Chain ID (e.g. 11155111). Set when using subgraph; may be omitted when using chain-only discovery. */
  chain_id?: number;
  name: string;
  capabilities: string[];
  score: number;
  why: string;
  trust: TrustSummary;
  /** MCP endpoint when known (e.g. from subgraph). Avoids re-resolving from chain in list_tools. */
  mcp_endpoint?: string | null;
}

export async function searchAgents(args: SearchAgentsArgs): Promise<{
  agents: RankedAgent[];
}> {
  const limit = Math.min(args.limit ?? 20, 50);
  const filters: SearchAgentsFilters = {
    capability: args.capability,
    min_reputation: args.min_reputation,
    min_validations: args.min_validations,
    supported_trust: args.supported_trust,
    limit,
  };

  const useSubgraph = getSubgraphUrl() != null;
  if (useSubgraph) {
    return searchAgentsViaSubgraph(filters);
  }

  const agentIds = await getAgentIds();
  const debug = process.env.DEBUG !== undefined && process.env.DEBUG !== "";
  if (debug) console.error(`[search_agents] resolving ${agentIds.length} agent(s)...`);
  const candidates: { card: AgentCard; trust: TrustSummary; score: number; chain_id?: number }[] = [];

  for (let i = 0; i < agentIds.length; i++) {
    const id = agentIds[i];
    const agentId = Number(id);
    if (debug) console.error(`[search_agents] agent ${i + 1}/${agentIds.length} id=${agentId}`);
    try {
      const card = await resolveAgentCard(agentId);
      const agentIdBigInt = BigInt(agentId);
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
      const trust: TrustSummary = {
        validationCount: validation.count,
        averageValidationResponse:
          validation.count > 0 ? validation.averageResponse : undefined,
        feedbackCount: reputation.count,
        summaryValue:
          reputation.count > 0 ? reputation.summaryValue : undefined,
        summaryValueDecimals:
          reputation.count > 0 ? reputation.summaryValueDecimals : undefined,
      };

      if (filters.capability) {
        const capLower = filters.capability.toLowerCase();
        const hasCap =
          card.capabilities.some((c) => c.toLowerCase().includes(capLower)) ||
          (card.description ?? "").toLowerCase().includes(capLower);
        if (!hasCap) continue;
      }
      if (
        filters.min_reputation != null &&
        (trust.summaryValue ?? 0) < filters.min_reputation
      )
        continue;
      if (
        filters.min_validations != null &&
        trust.validationCount < filters.min_validations
      )
        continue;
      if (filters.supported_trust?.length) {
        const hasTrust = filters.supported_trust.some((t) =>
          card.supportedTrust.includes(t)
        );
        if (!hasTrust) continue;
      }

      const score =
        trust.validationCount * 2 +
        (trust.averageValidationResponse ?? 0) / 10 +
        (trust.feedbackCount > 0 ? (trust.summaryValue ?? 0) / 100 : 0);
      candidates.push({ card, trust, score });
    } catch {
      // Skip agents that fail to resolve
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, limit);

  const agents: RankedAgent[] = top.map(({ card, trust, score }) => ({
    agent_id: card.agentId,
    name: card.name,
    capabilities: card.capabilities,
    score: Math.round(score * 100) / 100,
    why: buildWhy(trust, card),
    trust,
    mcp_endpoint: getMcpEndpointFromCard(card),
  }));

  return { agents };
}

/** Discovery via ERC-8004 subgraph GetAllMCPAgents (agent0lab/subgraph). */
async function searchAgentsViaSubgraph(filters: SearchAgentsFilters): Promise<{
  agents: RankedAgent[];
}> {
  const limit = filters.limit ?? 20;
  const subgraphAgents = await getAllMCPAgents({
    first: Math.min(limit * 3, 300),
    chainId: chainId,
  });

  const candidates: { card: AgentCard; trust: TrustSummary; score: number; chain_id: number }[] = [];

  for (const agent of subgraphAgents) {
    const card = subgraphAgentToAgentCard(agent);
    const feedbackCount = Number(agent.totalFeedback ?? 0);
    const trust: TrustSummary = {
      validationCount: 0,
      feedbackCount,
      summaryValue: undefined,
      summaryValueDecimals: undefined,
    };

    if (filters.capability) {
      const capLower = filters.capability.toLowerCase();
      const hasCap =
        card.capabilities.some((c) => c.toLowerCase().includes(capLower)) ||
        (card.description ?? "").toLowerCase().includes(capLower);
      if (!hasCap) continue;
    }
    if (
      filters.min_reputation != null &&
      (trust.summaryValue ?? 0) < filters.min_reputation
    )
      continue;
    if (
      filters.min_validations != null &&
      trust.validationCount < filters.min_validations
    )
      continue;
    if (filters.supported_trust?.length) {
      const hasTrust = filters.supported_trust.some((t) =>
        card.supportedTrust.includes(t)
      );
      if (!hasTrust) continue;
    }

    const score = feedbackCount; // subgraph gives totalFeedback; no validation summary in basic query
    candidates.push({
      card,
      trust,
      score,
      chain_id: Number(agent.chainId),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, limit);

  return {
    agents: top.map(({ card, trust, score, chain_id }) => ({
      agent_id: card.agentId,
      chain_id,
      name: card.name,
      capabilities: card.capabilities,
      score: Math.round(score * 100) / 100,
      why: buildWhy(trust, card),
      trust,
      mcp_endpoint: getMcpEndpointFromCard(card),
    })),
  };
}

function buildWhy(trust: TrustSummary, card: AgentCard): string {
  const parts: string[] = [];
  if (trust.validationCount > 0)
    parts.push(`${trust.validationCount} validations`);
  if (trust.averageValidationResponse != null && trust.validationCount > 0)
    parts.push(`avg validation ${trust.averageValidationResponse}`);
  if (trust.feedbackCount > 0)
    parts.push(`${trust.feedbackCount} feedback (value ${trust.summaryValue ?? "—"})`);
  if (card.supportedTrust.length)
    parts.push(`trust: ${card.supportedTrust.join(", ")}`);
  return parts.length ? parts.join("; ") : "No trust signals yet";
}

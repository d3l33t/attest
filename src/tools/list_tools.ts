/**
 * MCP tool: list_tools — return policy-approved tools synthesized from agents.
 * Discovers agents (search + optional agent_ids), applies policy, fetches tools from each agent's MCP endpoint, filters by risk class.
 */

import type { RankedAgent } from "./search_agents.js";
import { resolveAgent } from "./resolve_agent.js";
import { searchAgents } from "./search_agents.js";
import { getAgentMcpEndpoint, getMcpEndpointFromServices } from "../resolver/mcp-endpoint.js";
import { agentPassesPolicy, getToolRiskClass, riskClassAllowed } from "../policy/filter.js";
import {
  fetchRemoteTools,
  toSynthesizedId,
  type RemoteTool,
} from "./mcp-client-helper.js";

export const name = "list_tools";
export const description =
  "Return policy-approved tools from specific agents. For best performance and smaller context: call search_agents first, then list_tools with agent_ids from the search result. Optional filters (capability, min_reputation, etc.) only apply when agent_ids is omitted.";

export interface ListToolsArgs {
  capability?: string;
  min_reputation?: number;
  min_validations?: number;
  supported_trust?: string[];
  limit?: number;
  /** Include tools from these agent IDs even if not in search results (dynamic by capability). */
  agent_ids?: number[];
}

export interface SynthesizedTool {
  id: string;
  name: string;
  description?: string;
  agent_id: number;
  agent_name?: string;
  risk_class: "read_only" | "side_effecting";
  inputSchema: RemoteTool["inputSchema"];
}

export async function listTools(args: ListToolsArgs): Promise<{ tools: SynthesizedTool[] }> {
  const limit = Math.min(args.limit ?? 50, 100);
  const debug = process.env.DEBUG !== undefined && process.env.DEBUG !== "";
  const useAgentIdsOnly = (args.agent_ids?.length ?? 0) > 0;

  let agents: RankedAgent[];

  if (useAgentIdsOnly) {
    // Fast path: no search — resolve only the requested agents (e.g. from a prior search_agents call).
    const resolved = await Promise.all(
      args.agent_ids!.map(async (agentId) => {
        try {
          const { card, trust } = await resolveAgent({ agent_id: agentId });
          const mcp_endpoint = getMcpEndpointFromServices(card.services ?? []);
          return {
            agent_id: card.agentId,
            name: card.name,
            capabilities: card.capabilities ?? [],
            score: 0,
            why: "agent_ids",
            trust,
            mcp_endpoint: mcp_endpoint ?? undefined,
          } as RankedAgent;
        } catch (err) {
          if (debug) console.error(`[list_tools] resolve agent ${agentId} failed:`, err);
          return null;
        }
      })
    );
    agents = resolved.filter((a): a is RankedAgent => a != null);
    if (debug) console.error(`[list_tools] agent_ids path: ${agents.length} agent(s)`);
  } else {
    // Full path: search then include optional agent_ids as extras.
    const { agents: searchAgentsList } = await searchAgents({
      capability: args.capability,
      min_reputation: args.min_reputation,
      min_validations: args.min_validations,
      supported_trust: args.supported_trust,
      limit: Math.min(limit * 2, 50),
    });

    const seenIds = new Set(searchAgentsList.map((a) => a.agent_id));
    const extraAgents: RankedAgent[] = [];
    if (args.agent_ids?.length) {
      for (const agentId of args.agent_ids) {
        if (seenIds.has(agentId)) continue;
        seenIds.add(agentId);
        try {
          const { card, trust } = await resolveAgent({ agent_id: agentId });
          const mcp_endpoint = getMcpEndpointFromServices(card.services ?? []);
          extraAgents.push({
            agent_id: card.agentId,
            name: card.name,
            capabilities: card.capabilities ?? [],
            score: 0,
            why: "included via agent_ids",
            trust,
            mcp_endpoint: mcp_endpoint ?? undefined,
          });
        } catch (err) {
          if (debug) console.error(`[list_tools] resolve agent ${agentId} failed:`, err);
        }
      }
    }

    agents = [...searchAgentsList, ...extraAgents];
    if (debug) console.error(`[list_tools] search path: ${searchAgentsList.length} from search + ${extraAgents.length} from agent_ids = ${agents.length} agent(s)`);
  }

  const policyPassing = agents.filter((a) => {
    if (!agentPassesPolicy(a.trust)) {
      if (debug) console.error(`[list_tools] agent ${a.agent_id} (${a.name}) skipped by policy`);
      return false;
    }
    return true;
  });

  const toolsPerAgent = await Promise.all(
    policyPassing.map(async (agent) => {
      const endpoint =
        agent.mcp_endpoint ?? (await getAgentMcpEndpoint(agent.agent_id).catch(() => null));
      if (!endpoint) {
        if (debug) console.error(`[list_tools] agent ${agent.agent_id} (${agent.name}) has no MCP endpoint`);
        return [];
      }
      try {
        const remoteTools = await fetchRemoteTools(endpoint);
        return remoteTools.map((t) => ({ agent, tool: t }));
      } catch (err) {
        if (debug) console.error(`[list_tools] agent ${agent.agent_id} (${agent.name}) fetchRemoteTools failed:`, err);
        return [];
      }
    })
  );

  const tools: SynthesizedTool[] = [];
  for (const pair of toolsPerAgent.flat()) {
    const riskClass = getToolRiskClass(pair.tool.annotations);
    if (!riskClassAllowed(riskClass)) continue;
    tools.push({
      id: toSynthesizedId(pair.agent.agent_id, pair.tool.name),
      name: pair.tool.name,
      description: pair.tool.description,
      agent_id: pair.agent.agent_id,
      agent_name: pair.agent.name,
      risk_class: riskClass,
      inputSchema: pair.tool.inputSchema,
    });
    if (tools.length >= limit) break;
  }

  if (debug) console.error(`[list_tools] returning ${tools.length} tool(s)`);
  return { tools };
}

/**
 * MCP tool: connect_to_agent(agent_id) — connect to an agent's MCP server when found.
 * Resolves the agent, verifies policy, fetches tools from the MCP endpoint, and returns
 * connection status so the caller can use list_tools/invoke for that agent.
 */

import { resolveAgent } from "./resolve_agent.js";
import { getMcpEndpointFromServices } from "../resolver/mcp-endpoint.js";
import { agentPassesPolicy } from "../policy/filter.js";
import { fetchRemoteTools } from "./mcp-client-helper.js";

export const name = "connect_to_agent";
export const description =
  "Connect to an agent's MCP server by agent ID. Use when an agent with an MCP endpoint has been found (e.g. via search_agents or resolve_agent). Verifies the endpoint and returns tool count and names so you can use list_tools and invoke for this agent.";

export interface ConnectToAgentArgs {
  agent_id: number;
}

export async function connectToAgent(args: ConnectToAgentArgs): Promise<{
  connected: boolean;
  agent_id: number;
  endpoint?: string | null;
  tool_count?: number;
  tool_names?: string[];
  error?: string;
}> {
  const { agent_id } = args;
  const { card, trust } = await resolveAgent({ agent_id });
  const endpoint = getMcpEndpointFromServices(card.services ?? []);

  if (!endpoint) {
    return {
      connected: false,
      agent_id,
      error: "Agent has no MCP endpoint",
    };
  }

  if (!agentPassesPolicy(trust)) {
    return {
      connected: false,
      agent_id,
      endpoint,
      error: "Agent does not pass policy",
    };
  }

  try {
    const tools = await fetchRemoteTools(endpoint);
    return {
      connected: true,
      agent_id,
      endpoint,
      tool_count: tools.length,
      tool_names: tools.map((t) => t.name),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      agent_id,
      endpoint,
      error: errorMessage,
    };
  }
}

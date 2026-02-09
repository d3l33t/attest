/**
 * Resolve MCP endpoint URL from an agent's Agent Card.
 * Convention: prefer service with name "mcp" (case-insensitive); else first http(s) service.
 */

import type { AgentCard, EIP8004Service } from "../types/schemas.js";
import { resolveAgentCard } from "./agent-card.js";

function isHttpEndpoint(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("http://") || u.startsWith("https://");
}

/** Services array may be from AgentCard or serialized resolve_agent card. */
export function getMcpEndpointFromServices(
  services: Array<{ name?: string; endpoint?: string }>
): string | null {
  const mcpService = services.find((s) => s.name?.trim().toLowerCase() === "mcp");
  if (mcpService?.endpoint && isHttpEndpoint(mcpService.endpoint)) return mcpService.endpoint;
  const firstHttp = services.find((s) => s.endpoint && isHttpEndpoint(s.endpoint));
  return firstHttp?.endpoint ?? null;
}

/**
 * Returns the MCP endpoint URL from a card (e.g. from subgraph), or null if none found.
 */
export function getMcpEndpointFromCard(card: AgentCard): string | null {
  return getMcpEndpointFromServices(card.services ?? []);
}

/**
 * Returns the MCP endpoint URL for the agent, or null if none found.
 */
export async function getAgentMcpEndpoint(agentId: number): Promise<string | null> {
  const card = await resolveAgentCard(agentId);
  return getMcpEndpointFromServices(card.services ?? []);
}

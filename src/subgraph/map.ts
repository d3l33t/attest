/**
 * Map subgraph Agent + AgentRegistrationFile to internal discovery shape.
 * Subgraph provides name, description, mcpTools, supportedTrusts so we can
 * list and filter agents without fetching agentURI from chain.
 */

import type { AgentCard, EIP8004Service, TrustSummary } from "../types/schemas.js";
import type { SubgraphAgent, SubgraphAgentFull } from "./types.js";
import { identityRegistryAddress } from "../../config/chain.js";
import { getNetworkConfig } from "../../config/networks.js";

/** Registry namespace for an agent on a given chain (eip155:chainId:address). */
function agentRegistryForChain(chainIdNum: number): string {
  const addr = getNetworkConfig(chainIdNum)?.identityRegistry ?? identityRegistryAddress;
  return `eip155:${chainIdNum}:${addr}`;
}

/**
 * Map a subgraph agent to our AgentCard shape.
 * Uses registration file when present; otherwise minimal card from on-chain fields.
 */
export function subgraphAgentToAgentCard(agent: SubgraphAgent): AgentCard {
  const chainIdNum = Number(agent.chainId);
  const agentIdNum = Number(agent.agentId);
  const reg = agent.registrationFile;
  const registry = agentRegistryForChain(chainIdNum);

  if (!reg) {
    return {
      agentId: agentIdNum,
      agentRegistry: registry,
      name: `Agent ${agent.agentId}`,
      description: undefined,
      capabilities: [],
      services: [],
      verification_supported: [],
      payment_methods: [],
      supportedTrust: [],
      x402Support: false,
      active: true,
    };
  }

  const capabilities = [
    ...(reg.mcpTools ?? []),
    ...(reg.mcpPrompts ?? []),
    ...(reg.a2aSkills ?? []),
  ].filter(Boolean);
  const services: EIP8004Service[] = [];
  if (reg.mcpEndpoint) {
    services.push({
      name: "mcp",
      endpoint: reg.mcpEndpoint,
      version: reg.mcpVersion ?? undefined,
      skills: reg.mcpTools?.length ? reg.mcpTools : undefined,
    });
  }
  if (reg.a2aEndpoint) {
    services.push({
      name: "a2a",
      endpoint: reg.a2aEndpoint,
      version: reg.a2aVersion ?? undefined,
      skills: reg.a2aSkills?.length ? reg.a2aSkills : undefined,
    });
  }

  return {
    agentId: agentIdNum,
    agentRegistry: registry,
    name: reg.name ?? `Agent ${agent.agentId}`,
    description: reg.description ?? undefined,
    image: reg.image ?? undefined,
    capabilities,
    services,
    verification_supported: reg.supportedTrusts ?? [],
    payment_methods: reg.x402Support ? ["x402"] : [],
    supportedTrust: reg.supportedTrusts ?? [],
    x402Support: reg.x402Support ?? false,
    active: reg.active ?? true,
  };
}

/**
 * Map full agent (GetCompleteAgentDetails) to card + trust summary.
 */
export function fullAgentToCardAndTrust(agent: SubgraphAgentFull): {
  card: AgentCard;
  trust: TrustSummary;
} {
  const card = subgraphAgentToAgentCard(agent);
  const feedbackCount = Number(agent.totalFeedback ?? 0);
  const validations = agent.validations ?? [];
  const completed = validations.filter((v) => v.response != null);
  const validationCount = completed.length;
  const averageValidationResponse =
    validationCount > 0
      ? completed.reduce((s, v) => s + Number(v.response), 0) / validationCount
      : undefined;
  const trust: TrustSummary = {
    validationCount,
    averageValidationResponse,
    feedbackCount,
    summaryValue: undefined,
    summaryValueDecimals: undefined,
  };
  return { card, trust };
}

/**
 * Substrate agent API client: GetAllMCPAgents and GetCompleteAgentDetails.
 * When SUBSTRATE_AGENTS_API_URL is set, search_agents and resolve_agent use this instead of subgraph/chain.
 */

import type { AgentCard, EIP8004Service, TrustSummary } from "../types/schemas.js";

const DEFAULT_TIMEOUT_MS = 15_000;

/** Raw agent list item from GetAllMCPAgents (substrate API can return various shapes; we normalize). */
export interface SubstrateAgentListItem {
  agentId?: number;
  agent_id?: number;
  name?: string;
  capabilities?: string[];
  description?: string;
  chainId?: number;
  chain_id?: number;
  /** Trust/reputation fields if included */
  validationCount?: number;
  feedbackCount?: number;
  summaryValue?: number;
  summaryValueDecimals?: number;
  averageValidationResponse?: number;
  supportedTrust?: string[];
  [key: string]: unknown;
}

/** Raw response from GetCompleteAgentDetails (card + trust). */
export interface SubstrateAgentDetails {
  card?: Record<string, unknown>;
  trust?: Record<string, unknown>;
  agentId?: number;
  agent_id?: number;
  name?: string;
  capabilities?: string[];
  description?: string;
  services?: Array<{ name?: string; endpoint?: string; version?: string; skills?: string[] }>;
  supportedTrust?: string[];
  validationCount?: number;
  feedbackCount?: number;
  summaryValue?: number;
  summaryValueDecimals?: number;
  averageValidationResponse?: number;
  [key: string]: unknown;
}

export function getSubstrateAgentsApiUrl(): string | undefined {
  return process.env.SUBSTRATE_AGENTS_API_URL ?? process.env.SUBSTRATE_URL;
}

async function substrateCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const base = getSubstrateAgentsApiUrl();
  if (!base) throw new Error("SUBSTRATE_AGENTS_API_URL (or SUBSTRATE_URL) is not set");

  const body = { method, params };
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Substrate API error: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { result?: T; data?: T; error?: { message?: string } };
  if (json.error?.message) throw new Error(`Substrate API: ${json.error.message}`);
  const out = json.result ?? json.data;
  if (out === undefined) throw new Error("Substrate API returned no result");
  return out as T;
}

/**
 * Fetch all MCP agents from the substrate API.
 */
export async function getAllMCPAgents(): Promise<SubstrateAgentListItem[]> {
  const raw = await substrateCall<SubstrateAgentListItem[] | { agents?: SubstrateAgentListItem[] }>(
    "GetAllMCPAgents",
    []
  );
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { agents?: unknown }).agents))
    return (raw as { agents: SubstrateAgentListItem[] }).agents;
  return [];
}

/**
 * Fetch complete agent details (card + trust) for one agent.
 */
export async function getCompleteAgentDetails(
  agentId: number
): Promise<{ card: AgentCard; trust: TrustSummary }> {
  const raw = await substrateCall<SubstrateAgentDetails>("GetCompleteAgentDetails", [agentId]);
  return {
    card: substrateDetailsToAgentCard(raw, agentId),
    trust: substrateDetailsToTrustSummary(raw),
  };
}

function substrateDetailsToAgentCard(raw: SubstrateAgentDetails, fallbackAgentId: number): AgentCard {
  const id = raw.agentId ?? raw.agent_id ?? fallbackAgentId;
  const card = raw.card as Record<string, unknown> | undefined;
  const services: EIP8004Service[] = [];
  if (card?.services && Array.isArray(card.services)) {
    for (const s of card.services as EIP8004Service[]) {
      if (s?.endpoint) services.push({ name: s.name ?? "mcp", endpoint: s.endpoint, version: s.version, skills: s.skills });
    }
  }
  if (raw.services?.length) {
    for (const s of raw.services) {
      if (s?.endpoint) services.push({ name: s.name ?? "mcp", endpoint: s.endpoint, version: s.version, skills: s.skills });
    }
  }
  const capabilities = [
    ...(raw.capabilities ?? []),
    ...(card?.capabilities as string[] ?? []),
  ].filter(Boolean);
  const supportedTrust = (raw.supportedTrust ?? (card?.supportedTrust as string[]) ?? []) as string[];
  const agentRegistry = (card?.agentRegistry as string) ?? `eip155:1:0x0`;

  return {
    agentId: Number(id),
    agentRegistry,
    name: (raw.name ?? (card?.name as string) ?? `Agent ${id}`) as string,
    description: (raw.description ?? card?.description) as string | undefined,
    image: (raw.image ?? card?.image) as string | undefined,
    capabilities,
    services,
    verification_supported: supportedTrust,
    payment_methods: (raw.x402Support ?? card?.x402Support) ? ["x402"] : [],
    supportedTrust,
    x402Support: Boolean(raw.x402Support ?? card?.x402Support),
    active: (raw.active ?? card?.active) !== false,
  };
}

function substrateDetailsToTrustSummary(raw: SubstrateAgentDetails): TrustSummary {
  const trust = raw.trust as Record<string, unknown> | undefined;
  return {
    validationCount: Number(raw.validationCount ?? trust?.validationCount ?? 0),
    averageValidationResponse:
      raw.averageValidationResponse != null
        ? Number(raw.averageValidationResponse)
        : trust?.averageValidationResponse != null
          ? Number(trust.averageValidationResponse)
          : undefined,
    feedbackCount: Number(raw.feedbackCount ?? trust?.feedbackCount ?? 0),
    summaryValue:
      raw.summaryValue != null
        ? Number(raw.summaryValue)
        : trust?.summaryValue != null
          ? Number(trust.summaryValue)
          : undefined,
    summaryValueDecimals:
      raw.summaryValueDecimals != null
        ? Number(raw.summaryValueDecimals)
        : trust?.summaryValueDecimals != null
          ? Number(trust.summaryValueDecimals)
          : undefined,
  };
}

/**
 * Map a list item from GetAllMCPAgents to a minimal AgentCard + TrustSummary for ranking.
 */
export function substrateListItemToCardAndTrust(
  item: SubstrateAgentListItem,
  chainId?: number
): { card: AgentCard; trust: TrustSummary } {
  const agentId = item.agentId ?? item.agent_id ?? 0;
  const registry = chainId != null ? `eip155:${chainId}:0x0` : "eip155:1:0x0";
  const card: AgentCard = {
    agentId: Number(agentId),
    agentRegistry: registry,
    name: (item.name as string) ?? `Agent ${agentId}`,
    description: (item.description as string) ?? undefined,
    capabilities: (item.capabilities as string[]) ?? [],
    services: [],
    verification_supported: (item.supportedTrust as string[]) ?? [],
    payment_methods: [],
    supportedTrust: (item.supportedTrust as string[]) ?? [],
    x402Support: false,
    active: true,
  };
  const trust: TrustSummary = {
    validationCount: Number(item.validationCount ?? 0),
    averageValidationResponse: item.averageValidationResponse != null ? Number(item.averageValidationResponse) : undefined,
    feedbackCount: Number(item.feedbackCount ?? 0),
    summaryValue: item.summaryValue != null ? Number(item.summaryValue) : undefined,
    summaryValueDecimals: item.summaryValueDecimals != null ? Number(item.summaryValueDecimals) : undefined,
  };
  return { card, trust };
}

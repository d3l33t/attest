/**
 * GraphQL client for the ERC-8004 subgraph (agent0lab/subgraph).
 * Queries indexed agents across chains. Endpoint and optional API key via env.
 * See: https://github.com/agent0lab/subgraph (GetAllMCPAgents, GetCompleteAgentDetails).
 */

import type { SubgraphAgentWithStats, SubgraphAgentFull } from "./types.js";

const DEFAULT_FIRST = 200;
const MAX_FIRST = 1000;

export interface QueryAgentsOptions {
  /** Limit results (default 200, max 1000) */
  first?: number;
  /** Skip N results for pagination */
  skip?: number;
  /** Filter by chain ID (e.g. 11155111 for Sepolia). Omit for all chains. */
  chainId?: number;
  /** Only agents that have a registration file (default true) */
  withRegistrationOnly?: boolean;
}

const AGENTS_QUERY = `query QueryAgents($first: Int!, $skip: Int!, $where: Agent_filter) {
  agents(first: $first, skip: $skip, where: $where, orderBy: lastActivity, orderDirection: desc) {
    id
    chainId
    agentId
    agentURI
    owner
    createdAt
    updatedAt
    totalFeedback
    lastActivity
    registrationFile {
      id
      agentId
      name
      description
      image
      active
      x402Support
      supportedTrusts
      mcpEndpoint
      mcpVersion
      mcpTools
      mcpPrompts
      mcpResources
      a2aEndpoint
      a2aVersion
      a2aSkills
      ens
      did
      createdAt
    }
  }
}`;

/** Build subgraph URL; supports THE_GRAPH_API_KEY in path for gateway auth. */
export function getSubgraphUrl(): string | undefined {
  const base = process.env.SUBGRAPH_URL;
  if (!base) return undefined;
  const key = process.env.THE_GRAPH_API_KEY;
  if (!key) return base;
  // Gateway form: https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>
  try {
    const u = new URL(base);
    if (u.hostname === "gateway.thegraph.com" && u.pathname.includes("/subgraphs/id/")) {
      const idMatch = u.pathname.match(/\/subgraphs\/id\/([^/]+)/);
      const subgraphId = idMatch?.[1] ?? "";
      return `https://gateway.thegraph.com/api/${key}/subgraphs/id/${subgraphId}`;
    }
  } catch {
    // ignore
  }
  return base;
}

/** Run a GraphQL query against the configured subgraph. */
export async function subgraphQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const url = getSubgraphUrl();
  if (!url) throw new Error("SUBGRAPH_URL is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Subgraph request failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Subgraph GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (json.data == null) throw new Error("Subgraph returned no data");
  return json.data as T;
}

/** Query agents from the subgraph. */
export async function queryAgents(
  options: QueryAgentsOptions = {}
): Promise<SubgraphAgentWithStats[]> {
  const first = Math.min(
    options.first ?? DEFAULT_FIRST,
    MAX_FIRST
  );
  const skip = options.skip ?? 0;
  const where: Record<string, unknown> = {};
  if (options.withRegistrationOnly !== false) {
    where.registrationFile_not = null;
  }
  if (options.chainId != null) {
    where.chainId = String(options.chainId);
  }

  const data = await subgraphQuery<{ agents: SubgraphAgentWithStats[] }>(
    AGENTS_QUERY,
    {
      first,
      skip,
      where: Object.keys(where).length ? where : undefined,
    }
  );
  return data.agents;
}

/** Options for GetAllMCPAgents (MCP-compatible agents only). */
export interface GetAllMCPAgentsOptions {
  first?: number;
  skip?: number;
  chainId?: number;
}

/**
 * GetAllMCPAgents: query agents that have MCP endpoint and are active (per subgraph README).
 * Uses agents + registrationFile filter so we keep totalFeedback for ranking.
 */
const GET_ALL_MCP_AGENTS_QUERY = `query GetAllMCPAgents($first: Int!, $skip: Int!, $where: Agent_filter) {
  agents(first: $first, skip: $skip, where: $where, orderBy: lastActivity, orderDirection: desc) {
    id
    chainId
    agentId
    agentURI
    owner
    createdAt
    updatedAt
    totalFeedback
    lastActivity
    registrationFile {
      id
      agentId
      name
      description
      image
      active
      x402Support
      supportedTrusts
      mcpEndpoint
      mcpVersion
      mcpTools
      mcpPrompts
      mcpResources
      a2aEndpoint
      a2aVersion
      a2aSkills
      ens
      did
      createdAt
    }
  }
}`;

export async function getAllMCPAgents(
  options: GetAllMCPAgentsOptions = {}
): Promise<SubgraphAgentWithStats[]> {
  const first = Math.min(options.first ?? 100, MAX_FIRST);
  const skip = options.skip ?? 0;
  const where: Record<string, unknown> = {
    registrationFile_not: null,
    registrationFile_: {
      mcpEndpoint_not: null,
      active: true,
    },
  };
  if (options.chainId != null) {
    where.chainId = String(options.chainId);
  }
  const data = await subgraphQuery<{ agents: SubgraphAgentWithStats[] }>(
    GET_ALL_MCP_AGENTS_QUERY,
    { first, skip, where }
  );
  return data.agents;
}

/**
 * GetCompleteAgentDetails: full agent profile by id (per subgraph README).
 * id format is "chainId:agentId" (e.g. "1:5").
 */
const GET_COMPLETE_AGENT_DETAILS_QUERY = `query GetCompleteAgentDetails($agentId: ID!) {
  agent(id: $agentId) {
    id
    chainId
    agentId
    owner
    agentURI
    createdAt
    updatedAt
    totalFeedback
    lastActivity
    registrationFile {
      id
      agentId
      name
      description
      image
      active
      x402Support
      supportedTrusts
      mcpEndpoint
      mcpVersion
      mcpTools
      a2aEndpoint
      a2aVersion
      a2aSkills
      ens
      did
    }
    feedback(where: { isRevoked: false }, first: 10) {
      tag1
      tag2
      clientAddress
      createdAt
      feedbackFile {
        text
      }
      responses {
        responder
        createdAt
      }
    }
    validations(orderBy: createdAt, orderDirection: desc) {
      validatorAddress
      response
      status
      tag
      createdAt
    }
  }
}`;

export async function getCompleteAgentDetails(
  agentId: number,
  chainIdNum: number
): Promise<SubgraphAgentFull | null> {
  const id = `${chainIdNum}:${agentId}`;
  const data = await subgraphQuery<{ agent: SubgraphAgentFull | null }>(
    GET_COMPLETE_AGENT_DETAILS_QUERY,
    { agentId: id }
  );
  return data.agent;
}


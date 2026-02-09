/**
 * Types for the ERC-8004 subgraph (agent0lab/subgraph).
 * GraphQL BigInt/ID come as strings in JSON.
 * https://github.com/agent0lab/subgraph
 */

export interface SubgraphAgentRegistrationFile {
  id: string;
  agentId: string;
  name: string | null;
  description: string | null;
  image: string | null;
  active: boolean | null;
  x402Support: boolean | null;
  supportedTrusts: string[];
  mcpEndpoint: string | null;
  mcpVersion: string | null;
  mcpTools: string[];
  mcpPrompts: string[];
  mcpResources: string[];
  a2aEndpoint: string | null;
  a2aVersion: string | null;
  a2aSkills: string[];
  ens: string | null;
  did: string | null;
  createdAt: string;
}

export interface SubgraphAgent {
  id: string;
  chainId: string;
  agentId: string;
  agentURI: string | null;
  owner: string;
  createdAt: string;
  updatedAt: string;
  totalFeedback: string;
  lastActivity: string;
  registrationFile: SubgraphAgentRegistrationFile | null;
}

/** Agent from subgraph; optional stats can be added later for ranking. */
export type SubgraphAgentWithStats = SubgraphAgent;

/** Agent with full profile for GetCompleteAgentDetails (feedback + validations). */
export interface SubgraphAgentFull {
  id: string;
  chainId: string;
  agentId: string;
  agentURI: string | null;
  owner: string;
  createdAt: string;
  updatedAt: string;
  totalFeedback: string;
  lastActivity: string;
  registrationFile: SubgraphAgentRegistrationFile | null;
  feedback?: Array<{
    tag1: string | null;
    tag2: string | null;
    clientAddress: string;
    createdAt: string;
    feedbackFile?: { text: string | null } | null;
    responses?: Array<{ responder: string; createdAt: string }>;
  }>;
  validations?: Array<{
    validatorAddress: string;
    response: number | null;
    status: string;
    tag: string | null;
    createdAt: string;
  }>;
}

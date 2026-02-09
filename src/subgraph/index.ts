/**
 * ERC-8004 subgraph integration (agent0lab/subgraph).
 * Query indexed agents across chains for discovery without scanning chain events.
 *
 * Set SUBGRAPH_URL to enable. Optional THE_GRAPH_API_KEY for gateway auth.
 * Example: SUBGRAPH_URL=https://gateway.thegraph.com/api/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT
 * With key: SUBGRAPH_URL=... (same) and THE_GRAPH_API_KEY=your_key
 */

export { getSubgraphUrl, queryAgents, subgraphQuery, getAllMCPAgents, getCompleteAgentDetails } from "./client.js";
export type { QueryAgentsOptions, GetAllMCPAgentsOptions } from "./client.js";
export { subgraphAgentToAgentCard, fullAgentToCardAndTrust } from "./map.js";
export type {
  SubgraphAgent,
  SubgraphAgentRegistrationFile,
  SubgraphAgentWithStats,
} from "./types.js";

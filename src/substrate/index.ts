/**
 * Substrate agent API: GetAllMCPAgents and GetCompleteAgentDetails.
 * Set SUBSTRATE_AGENTS_API_URL (or SUBSTRATE_URL) to use substrate for agent search and resolve.
 */

export {
  getSubstrateAgentsApiUrl,
  getAllMCPAgents,
  getCompleteAgentDetails,
  substrateListItemToCardAndTrust,
} from "./client.js";
export type { SubstrateAgentListItem, SubstrateAgentDetails } from "./client.js";

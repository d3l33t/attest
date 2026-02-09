/**
 * MCP tool: register_agent(agentCardUri) — register agent in ERC-8004 Identity Registry.
 */

import { registerAgent } from "../registry/adapter.js";

export const name = "register_agent";
export const description =
  "Register an agent in the ERC-8004 Identity Registry. Publishes the Agent Card URI (e.g. IPFS or HTTPS). Requires PRIVATE_KEY. Returns the new agent ID and transaction hash.";

export const argsSchema = {
  type: "object" as const,
  properties: {
    agentCardUri: {
      type: "string",
      description: "URI to the agent registration file (EIP-8004 registration-v1 JSON). e.g. ipfs://... or https://...",
    },
  },
  required: ["agentCardUri"],
  additionalProperties: false,
};

export interface RegisterAgentArgs {
  agentCardUri: string;
}

export async function registerAgentTool(
  args: RegisterAgentArgs
): Promise<{ agentId: number; txHash: string }> {
  const { agentId, txHash } = await registerAgent(args.agentCardUri);
  return { agentId: Number(agentId), txHash };
}

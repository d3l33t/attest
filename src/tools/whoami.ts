/**
 * MCP tool: whoami — returns current principal (Ethereum address) and session scopes.
 * MVP: principal from PRIVATE_KEY or "anonymous"; full SIWE is a future enhancement.
 */

import { privateKeyToAccount } from "viem/accounts";
import { privateKey } from "../../config/chain.js";
import { getPolicyConfig } from "../policy/config.js";

export const name = "whoami";
export const description =
  "Returns current principal (Ethereum address) and session scopes. MVP: principal derived from PRIVATE_KEY when set, otherwise anonymous. Full SIWE (session token) is a future enhancement.";

export interface WhoAmIResult {
  principal: string;
  sessionScopes: string[];
  policySummary?: { minReputation: number; allowRiskClass: string[] };
}

export function whoami(): WhoAmIResult {
  const policy = getPolicyConfig();
  let principal: string;
  let sessionScopes: string[];

  if (privateKey) {
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      principal = account.address;
      sessionScopes = ["default", "invoke", "list_tools", "discovery"];
    } catch {
      principal = "anonymous";
      sessionScopes = ["discovery"];
    }
  } else {
    principal = "anonymous";
    sessionScopes = ["discovery"];
  }

  return {
    principal,
    sessionScopes,
    policySummary: {
      minReputation: policy.minReputation,
      allowRiskClass: policy.allowRiskClass,
    },
  };
}

/**
 * Policy filtering: apply min reputation, validator allowlist, risk class to agents and tools.
 */

import type { TrustSummary } from "../types/schemas.js";
import { getPolicyConfig, type RiskClass } from "./config.js";

export function agentPassesPolicy(trust: TrustSummary): boolean {
  const policy = getPolicyConfig();
  const rep = trust.summaryValue ?? 0;
  if (rep < policy.minReputation) return false;
  if (policy.validatorAllowlist.length > 0 && (trust.validationCount ?? 0) === 0) return false;
  return true;
}

/**
 * Derive risk class from MCP tool annotations (readOnlyHint, destructiveHint).
 * Default to side_effecting if unknown.
 */
export function getToolRiskClass(annotations?: {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}): RiskClass {
  if (annotations?.readOnlyHint === true) return "read_only";
  return "side_effecting";
}

export function riskClassAllowed(riskClass: RiskClass): boolean {
  return getPolicyConfig().allowRiskClass.includes(riskClass);
}

export function toolPassesPolicy(trust: TrustSummary, riskClass: RiskClass): boolean {
  return agentPassesPolicy(trust) && riskClassAllowed(riskClass);
}

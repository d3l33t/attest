/**
 * Policy configuration loaded from env (and optional file).
 * Exposes: minimum reputation, validator allowlist, allowed risk classes.
 */

export type RiskClass = "read_only" | "side_effecting";

function parseRiskClasses(s: string | undefined): RiskClass[] {
  if (!s || !s.trim()) return ["read_only", "side_effecting"];
  const parts = s.split(",").map((p) => p.trim().toLowerCase());
  const out: RiskClass[] = [];
  if (parts.includes("read_only")) out.push("read_only");
  if (parts.includes("side_effecting")) out.push("side_effecting");
  return out.length ? out : ["read_only", "side_effecting"];
}

function parseValidatorAllowlist(s: string | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
}

export interface PolicyConfig {
  minReputation: number;
  validatorAllowlist: string[];
  allowRiskClass: RiskClass[];
  invokeTimeoutMs: number;
  rateLimitPerMinute: number;
}

let cached: PolicyConfig | null = null;

export function getPolicyConfig(): PolicyConfig {
  if (cached) return cached;
  const minRep = process.env.MIN_REPUTATION;
  cached = {
    minReputation: minRep != null && minRep !== "" ? Number(minRep) : 0,
    validatorAllowlist: parseValidatorAllowlist(process.env.VALIDATOR_ALLOWLIST),
    allowRiskClass: parseRiskClasses(process.env.ALLOW_RISK_CLASS),
    invokeTimeoutMs: process.env.INVOKE_TIMEOUT_MS != null && process.env.INVOKE_TIMEOUT_MS !== ""
      ? Number(process.env.INVOKE_TIMEOUT_MS)
      : 60_000,
    rateLimitPerMinute: process.env.RATE_LIMIT_PER_MINUTE != null && process.env.RATE_LIMIT_PER_MINUTE !== ""
      ? Number(process.env.RATE_LIMIT_PER_MINUTE)
      : 0,
  };
  return cached;
}

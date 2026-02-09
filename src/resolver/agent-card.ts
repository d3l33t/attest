/**
 * Agent Card Resolver: fetch agentURI from Identity, fetch registration file (HTTP/IPFS), parse and normalize to internal AgentCard.
 */

import { getAgentURI } from "../registry/adapter.js";
import type {
  AgentCard,
  EIP8004RegistrationFile,
  EIP8004Service,
} from "../types/schemas.js";
import { agentRegistryNamespace } from "../../config/chain.js";

const REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice(7).replace(/^\/+/, "");
    return `${IPFS_GATEWAY}${cid}`;
  }
  if (uri.startsWith("data:")) return uri;
  return uri;
}

async function fetchJson(uri: string): Promise<unknown> {
  const url = resolveUri(uri);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Failed to fetch agent card: ${res.status} ${url}`);
  return res.json();
}

function parseRegistrationFile(raw: unknown): EIP8004RegistrationFile {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== "object") throw new Error("Invalid registration: not an object");
  const type = o.type as string | undefined;
  if (type !== REGISTRATION_TYPE)
    throw new Error(`Unsupported registration type: ${type}`);
  const name = o.name as string | undefined;
  if (!name || typeof name !== "string")
    throw new Error("Missing or invalid registration name");
  const services = o.services as EIP8004Service[] | undefined;
  if (!Array.isArray(services)) throw new Error("Missing or invalid registration services");
  const registrations = o.registrations as { agentId: number; agentRegistry: string }[] | undefined;
  if (!Array.isArray(registrations) || registrations.length === 0)
    throw new Error("Missing or invalid registration registrations");
  return {
    type,
    name,
    description: o.description as string | undefined,
    image: o.image as string | undefined,
    services,
    x402Support: (o.x402Support as boolean) ?? false,
    active: (o.active as boolean) ?? true,
    registrations,
    supportedTrust: (o.supportedTrust as string[]) ?? [],
  };
}

/** Extract capabilities from description or a custom extension; default to empty. */
function extractCapabilities(reg: EIP8004RegistrationFile): string[] {
  const ext = reg as unknown as Record<string, unknown>;
  if (Array.isArray(ext.capabilities))
    return ext.capabilities.filter((c): c is string => typeof c === "string");
  const desc = reg.description ?? "";
  if (!desc) return [];
  const lower = desc.toLowerCase();
  const capabilityKeywords = ["code-review", "translation", "solidity-audit", "testing", "lint", "audit"];
  return capabilityKeywords.filter((k) => lower.includes(k));
}

/** Extract verification_supported from registration or extension. */
function extractVerificationSupported(reg: EIP8004RegistrationFile): string[] {
  const ext = reg as unknown as Record<string, unknown>;
  if (Array.isArray(ext.verification_supported))
    return ext.verification_supported.filter((v): v is string => typeof v === "string");
  return reg.supportedTrust ?? [];
}

/** Extract payment_methods from extension. */
function extractPaymentMethods(reg: EIP8004RegistrationFile): string[] {
  const ext = reg as unknown as Record<string, unknown>;
  if (Array.isArray(ext.payment_methods))
    return ext.payment_methods.filter((m): m is string => typeof m === "string");
  return reg.x402Support ? ["x402"] : [];
}

/** Normalize EIP-8004 registration file to internal AgentCard. */
export function normalizeToAgentCard(
  agentId: number,
  reg: EIP8004RegistrationFile,
  agentRegistry: string
): AgentCard {
  return {
    agentId,
    agentRegistry,
    name: reg.name,
    description: reg.description,
    image: reg.image,
    capabilities: extractCapabilities(reg),
    services: reg.services,
    verification_supported: extractVerificationSupported(reg),
    payment_methods: extractPaymentMethods(reg),
    supportedTrust: reg.supportedTrust ?? [],
    x402Support: reg.x402Support ?? false,
    active: reg.active ?? true,
    raw: reg,
  };
}

const cache = new Map<string, { card: AgentCard; at: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export async function resolveAgentCard(
  agentId: number,
  identityRegistryAddress?: string
): Promise<AgentCard> {
  const cacheKey = `${agentId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.card;

  const agentIdBigInt = BigInt(agentId);
  const uri = await getAgentURI(agentIdBigInt);
  if (!uri) throw new Error(`No agentURI for agent ${agentId}`);
  const raw = await fetchJson(uri);
  const reg = parseRegistrationFile(raw);
  const regEntry = reg.registrations.find((r) => Number(r.agentId) === agentId);
  const agentRegistry = regEntry?.agentRegistry ?? agentRegistryNamespace;
  const card = normalizeToAgentCard(agentId, reg, agentRegistry);
  cache.set(cacheKey, { card, at: Date.now() });
  return card;
}

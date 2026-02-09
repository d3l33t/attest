/**
 * ERC-8004 chain and registry configuration.
 * Use env: CHAIN_ID, RPC_URL, IDENTITY_REGISTRY, REPUTATION_REGISTRY, VALIDATION_REGISTRY, PRIVATE_KEY (optional).
 * For known chains (Sepolia, Polygon Amoy), registry addresses default from config/networks.ts (official erc-8004-contracts).
 */

import { getNetworkConfig } from "./networks.js";

export const chainId = Number(process.env.CHAIN_ID ?? "80002"); // Polygon Amoy default

const network = getNetworkConfig(chainId);
const _rpc = process.env.RPC_URL ?? network?.rpcUrl ?? "https://rpc-amoy.polygon.technology";
export const rpcUrl = _rpc;

export const identityRegistryAddress = (process.env.IDENTITY_REGISTRY ??
  network?.identityRegistry ??
  "0x8004A818BFB912233c491871b3d84c89A494BD9e") as `0x${string}`;
export const reputationRegistryAddress = (process.env.REPUTATION_REGISTRY ??
  network?.reputationRegistry ??
  "0x8004B663056A597Dffe9eCcC1965A193B7388713") as `0x${string}`;
export const validationRegistryAddress = (process.env.VALIDATION_REGISTRY ??
  network?.validationRegistry ??
  "0x8004C11C213ff7BaD36489bcBDF947ba5eee289B") as `0x${string}`;

/** Optional: for register, giveFeedback, validationResponse */
export const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;

/** Namespace for agent registry identifier */
export const agentRegistryNamespace = `eip155:${chainId}:${identityRegistryAddress}`;

/** Max blocks to scan for agent IDs (default 1M). Set to 0 to scan from genesis (slow on long chains). */
export const searchMaxBlocks = process.env.SEARCH_MAX_BLOCKS != null && process.env.SEARCH_MAX_BLOCKS !== ""
  ? BigInt(process.env.SEARCH_MAX_BLOCKS)
  : 1_000_000n;

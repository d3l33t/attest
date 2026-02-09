/**
 * Known ERC-8004 network presets (registry addresses per chain).
 * Source: https://github.com/erc-8004/erc-8004-contracts/blob/master/README.md (Identity + Reputation).
 * Validation Registry is not listed in the official README; Polygon Amoy validation
 * address is from Polygon docs. Env vars (IDENTITY_REGISTRY, etc.) override these.
 *
 * Two address patterns in the README:
 * - Mainnet: Identity 0x8004A169..., Reputation 0x8004BAa1...
 * - Testnet: Identity 0x8004A818..., Reputation 0x8004B663...
 */

export type Address = `0x${string}`;

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  identityRegistry: Address;
  reputationRegistry: Address;
  /** Validation Registry; not in official README for any chain. Set via env if needed. */
  validationRegistry?: Address;
}

/** Mainnet registry addresses (from erc-8004-contracts README). */
const MAINNET_IDENTITY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address;
const MAINNET_REPUTATION = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address;
/** Testnet registry addresses (Sepolia, Base Sepolia, Polygon Amoy, Gnosis, Scroll Testnet, Monad Testnet, BSC Testnet). */
const TESTNET_IDENTITY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;
const TESTNET_REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address;

/**
 * Official deployments from erc-8004-contracts README. All addresses match
 * https://github.com/erc-8004/erc-8004-contracts/blob/master/README.md
 */
export const KNOWN_NETWORKS: Record<number, NetworkConfig> = {
  // ─── Ethereum ─────────────────────────────────────────────────────────────
  1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrl: "https://eth.llamarpc.com",
    identityRegistry: MAINNET_IDENTITY,
    reputationRegistry: MAINNET_REPUTATION,
  },
  11155111: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    rpcUrl: "https://rpc.sepolia.org",
    identityRegistry: TESTNET_IDENTITY,
    reputationRegistry: TESTNET_REPUTATION,
  },

  // ─── Base ─────────────────────────────────────────────────────────────────
  8453: {
    chainId: 8453,
    name: "Base Mainnet",
    rpcUrl: "https://mainnet.base.org",
    identityRegistry: MAINNET_IDENTITY,
    reputationRegistry: MAINNET_REPUTATION,
  },
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    identityRegistry: TESTNET_IDENTITY,
    reputationRegistry: TESTNET_REPUTATION,
  },

  // ─── Polygon ───────────────────────────────────────────────────────────────
  137: {
    chainId: 137,
    name: "Polygon Mainnet",
    rpcUrl: "https://polygon-rpc.com",
    identityRegistry: MAINNET_IDENTITY,
    reputationRegistry: MAINNET_REPUTATION,
  },
  80002: {
    chainId: 80002,
    name: "Polygon Amoy",
    rpcUrl: "https://rpc-amoy.polygon.technology",
    identityRegistry: TESTNET_IDENTITY,
    reputationRegistry: TESTNET_REPUTATION,
    validationRegistry: "0x8004C11C213ff7BaD36489bcBDF947ba5eee289B" as Address, // Polygon docs only
  },

  // ─── Gnosis ──────────────────────────────────────────────────────────────
  100: {
    chainId: 100,
    name: "Gnosis Mainnet",
    rpcUrl: "https://rpc.gnosischain.com",
    identityRegistry: TESTNET_IDENTITY,
    reputationRegistry: TESTNET_REPUTATION,
  },

  // ─── Scroll ───────────────────────────────────────────────────────────────
  534352: {
    chainId: 534352,
    name: "Scroll Mainnet",
    rpcUrl: "https://rpc.scroll.io",
    identityRegistry: MAINNET_IDENTITY,
    reputationRegistry: MAINNET_REPUTATION,
  },
  534351: {
    chainId: 534351,
    name: "Scroll Sepolia",
    rpcUrl: "https://sepolia-rpc.scroll.io",
    identityRegistry: TESTNET_IDENTITY,
    reputationRegistry: TESTNET_REPUTATION,
  },

  // ─── Monad ───────────────────────────────────────────────────────────────
  // 10143 = Monad Testnet (per chainlist). Mainnet not in chainlist yet.
  10143: {
    chainId: 10143,
    name: "Monad Testnet",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    identityRegistry: TESTNET_IDENTITY,
    reputationRegistry: TESTNET_REPUTATION,
  },

  // ─── BSC ─────────────────────────────────────────────────────────────────
  56: {
    chainId: 56,
    name: "BSC Mainnet",
    rpcUrl: "https://bsc-dataseed.binance.org",
    identityRegistry: MAINNET_IDENTITY,
    reputationRegistry: MAINNET_REPUTATION,
  },
  97: {
    chainId: 97,
    name: "BSC Testnet",
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
    identityRegistry: TESTNET_IDENTITY,
    reputationRegistry: TESTNET_REPUTATION,
  },
};

/**
 * Polygon Amoy "Polygon docs" deployment (different from official; includes Validation).
 * Use by setting env: IDENTITY_REGISTRY=0x8004ad19..., REPUTATION_REGISTRY=0x8004B12F..., VALIDATION_REGISTRY=0x8004C11C...
 * or by selecting this preset when we add CHAIN_PRESET in the future.
 */
export const POLYGON_AMOY_ALT: NetworkConfig = {
  chainId: 80002,
  name: "Polygon Amoy (Polygon docs deployment)",
  rpcUrl: "https://rpc-amoy.polygon.technology",
  identityRegistry: "0x8004ad19E14B9e0654f73353e8a0B600D46C2898" as Address,
  reputationRegistry: "0x8004B12F4C2B42d00c46479e859C92e39044C930" as Address,
  validationRegistry: "0x8004C11C213ff7BaD36489bcBDF947ba5eee289B" as Address,
};

export function getNetworkConfig(chainId: number): NetworkConfig | undefined {
  return KNOWN_NETWORKS[chainId];
}

export function getSupportedChainIds(): number[] {
  return Object.keys(KNOWN_NETWORKS).map(Number);
}

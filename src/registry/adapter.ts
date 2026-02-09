/**
 * Registry Adapter: single entry for all ERC-8004 on-chain reads (and optional writes).
 * Uses viem; config from config/chain.ts.
 */

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy, sepolia } from "viem/chains";
import {
  chainId,
  rpcUrl,
  identityRegistryAddress,
  reputationRegistryAddress,
  validationRegistryAddress,
  privateKey,
  searchMaxBlocks,
} from "../../config/chain.js";
import {
  identityRegistryAbi,
  reputationRegistryAbi,
  validationRegistryAbi,
} from "./contracts.js";

const knownChains = { 80002: polygonAmoy, 11155111: sepolia } as const;
const chain =
  knownChains[chainId as keyof typeof knownChains] ??
  { id: chainId, name: "Unknown", nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" }, rpcUrls: { default: { http: [rpcUrl] } } };

const transport = http(rpcUrl);
const publicClient: PublicClient = createPublicClient({
  chain,
  transport,
});

export function getWallet(): WalletClient | undefined {
  if (!privateKey) return undefined;
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain,
    transport,
  });
}

// --- Identity Registry ---

export async function getAgentURI(agentId: bigint): Promise<string> {
  const uri = await publicClient.readContract({
    address: identityRegistryAddress,
    abi: identityRegistryAbi,
    functionName: "tokenURI",
    args: [agentId],
  });
  return uri;
}

const BLOCK_CHUNK = 1_000n; // conservative for mainnet RPCs (many limit eth_getLogs to 1k–10k blocks)
const DEBUG = process.env.DEBUG !== undefined && process.env.DEBUG !== "";

export async function getAgentIds(fromBlock?: bigint): Promise<bigint[]> {
  const toBlock = await publicClient.getBlockNumber();
  const start =
    fromBlock ??
    (searchMaxBlocks === 0n ? 0n : toBlock > searchMaxBlocks ? toBlock - searchMaxBlocks : 0n);
  const allIds = new Set<bigint>();
  let chunkIndex = 0;
  const totalChunks = Number((toBlock - start + 1n + BLOCK_CHUNK - 1n) / BLOCK_CHUNK);
  for (let from = start; from <= toBlock; from += BLOCK_CHUNK) {
    const chunkTo = from + BLOCK_CHUNK - 1n > toBlock ? toBlock : from + BLOCK_CHUNK - 1n;
    if (DEBUG) console.error(`[getAgentIds] chunk ${chunkIndex + 1}/${totalChunks} blocks ${from}-${chunkTo}`);
    const logs = await publicClient.getContractEvents({
      address: identityRegistryAddress,
      abi: identityRegistryAbi,
      eventName: "Registered",
      fromBlock: from,
      toBlock: chunkTo,
    });
    for (const e of logs) {
      if (e.args.agentId != null) allIds.add(e.args.agentId);
    }
    chunkIndex++;
  }
  if (DEBUG) console.error(`[getAgentIds] done: ${allIds.size} agent(s)`);
  return [...allIds];
}

export async function ownerOf(agentId: bigint): Promise<Address> {
  return publicClient.readContract({
    address: identityRegistryAddress,
    abi: identityRegistryAbi,
    functionName: "ownerOf",
    args: [agentId],
  });
}

export async function registerAgent(agentURI: string): Promise<{ agentId: bigint; txHash: Hash }> {
  const wallet = getWallet();
  if (!wallet?.account) throw new Error("PRIVATE_KEY required for registerAgent");
  const { request } = await publicClient.simulateContract({
    address: identityRegistryAddress,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [agentURI],
    account: wallet.account,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== identityRegistryAddress.toLowerCase()) continue;
    try {
      const d = decodeEventLog({
        abi: identityRegistryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (d.eventName === "Registered" && d.args.agentId != null)
        return { agentId: d.args.agentId, txHash };
    } catch {
      // not our event
    }
  }
  return { agentId: 0n, txHash };
}

// --- Reputation Registry ---

export interface ReputationSummary {
  count: number;
  summaryValue: number;
  summaryValueDecimals: number;
}

export async function getReputationSummary(
  agentId: bigint,
  clientAddresses: Address[] = [],
  tag1 = "",
  tag2 = ""
): Promise<ReputationSummary> {
  if (clientAddresses.length === 0) {
    const clients = await getReputationClients(agentId);
    if (clients.length === 0)
      return { count: 0, summaryValue: 0, summaryValueDecimals: 0 };
    clientAddresses = clients;
  }
  const [count, summaryValue, summaryValueDecimals] =
    await publicClient.readContract({
      address: reputationRegistryAddress,
      abi: reputationRegistryAbi,
      functionName: "getSummary",
      args: [agentId, clientAddresses, tag1, tag2],
    });
  return {
    count: Number(count),
    summaryValue: Number(summaryValue),
    summaryValueDecimals: Number(summaryValueDecimals),
  };
}

export async function getReputationClients(agentId: bigint): Promise<Address[]> {
  const clients = await publicClient.readContract({
    address: reputationRegistryAddress,
    abi: reputationRegistryAbi,
    functionName: "getClients",
    args: [agentId],
  });
  return [...clients];
}

export async function giveFeedback(
  agentId: bigint,
  value: number,
  valueDecimals: number,
  tag1 = "",
  tag2 = "",
  endpoint = "",
  feedbackURI = "",
  feedbackHash: Hash = "0x0000000000000000000000000000000000000000000000000000000000000000"
): Promise<Hash> {
  const wallet = getWallet();
  if (!wallet?.account) throw new Error("PRIVATE_KEY required for giveFeedback");
  const { request } = await publicClient.simulateContract({
    address: reputationRegistryAddress,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      agentId,
      BigInt(Math.round(value)),
      valueDecimals,
      tag1,
      tag2,
      endpoint,
      feedbackURI,
      feedbackHash as `0x${string}`,
    ],
    account: wallet.account,
  });
  return wallet.writeContract(request);
}

// --- Validation Registry ---

export interface ValidationSummary {
  count: number;
  averageResponse: number;
}

export async function getValidationSummary(
  agentId: bigint,
  validatorAddresses: Address[] = [],
  tag = ""
): Promise<ValidationSummary> {
  const [count, averageResponse] = await publicClient.readContract({
    address: validationRegistryAddress,
    abi: validationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, validatorAddresses, tag],
  });
  return {
    count: Number(count),
    averageResponse: Number(averageResponse),
  };
}

export async function getAgentValidations(agentId: bigint): Promise<Hash[]> {
  const hashes = await publicClient.readContract({
    address: validationRegistryAddress,
    abi: validationRegistryAbi,
    functionName: "getAgentValidations",
    args: [agentId],
  });
  return [...hashes];
}

export interface ValidationStatus {
  validatorAddress: Address;
  agentId: bigint;
  response: number;
  responseHash: Hash;
  tag: string;
  lastUpdate: bigint;
}

export async function getValidationStatus(
  requestHash: Hash
): Promise<ValidationStatus> {
  const [validatorAddress, agentId, response, responseHash, tag, lastUpdate] =
    await publicClient.readContract({
      address: validationRegistryAddress,
      abi: validationRegistryAbi,
      functionName: "getValidationStatus",
      args: [requestHash as `0x${string}`],
    });
  return {
    validatorAddress,
    agentId,
    response: Number(response),
    responseHash,
    tag,
    lastUpdate,
  };
}

export async function validationRequest(
  validatorAddress: Address,
  agentId: bigint,
  requestURI: string,
  requestHash: Hash
): Promise<Hash> {
  const wallet = getWallet();
  if (!wallet?.account)
    throw new Error("PRIVATE_KEY required for validationRequest");
  const { request } = await publicClient.simulateContract({
    address: validationRegistryAddress,
    abi: validationRegistryAbi,
    functionName: "validationRequest",
    args: [validatorAddress, agentId, requestURI, requestHash as `0x${string}`],
    account: wallet.account,
  });
  return wallet.writeContract(request);
}

export async function validationResponse(
  requestHash: Hash,
  response: number,
  responseURI = "",
  responseHash: Hash = "0x0000000000000000000000000000000000000000000000000000000000000000",
  tag = ""
): Promise<Hash> {
  const wallet = getWallet();
  if (!wallet?.account)
    throw new Error("PRIVATE_KEY required for validationResponse");
  const { request } = await publicClient.simulateContract({
    address: validationRegistryAddress,
    abi: validationRegistryAbi,
    functionName: "validationResponse",
    args: [
      requestHash as `0x${string}`,
      response,
      responseURI,
      responseHash as `0x${string}`,
      tag,
    ],
    account: wallet.account,
  });
  return wallet.writeContract(request);
}

export { publicClient };

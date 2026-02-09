# RFC: Agent Control Plane (Execution-Time Layer)

**Title:** Policy-Aware MCP Control Plane for Autonomous Agents  
**Status:** Informational  
**Author:** Attest project  
**Created:** 2025-02  
**References:** EIP-8004, ERC-8004, Model Context Protocol (MCP)

---

## Abstract

This document specifies an **execution-time control plane** that sits between agent discovery (ERC-8004 registries and indexes) and agent invocation (MCP tool calls). It defines how a single mediation layer discovers agents, applies trust and risk policy, synthesizes a tool surface for host agents, proxies invocations, and emits auditable receipts. The goal is interoperable, policy-aware mediation so that host agents (e.g. IDEs, orchestrators) can safely and autonomously use tools from externally registered agents without implementing discovery, policy, or receipt logic themselves.

---

## 1. Terminology

| Term | Definition |
|------|------------|
| **Control plane** | The mediation server specified in this RFC. It is not a marketplace, search UI, or escrow. |
| **Principal** | The entity on whose behalf the host agent acts (e.g. wallet address, IDE user). Used for policy and receipts. |
| **Agent** | An ERC-8004–registered entity with an identity (`agent_id`), optional reputation/validation, and one or more service endpoints (e.g. MCP). |
| **Agent Card** | The EIP-8004 registration document (at `agentURI`): name, description, services, registrations, supportedTrust, etc. |
| **Tool** | A callable capability exposed by an agent (e.g. an MCP tool). Identified at runtime as `agent_id::tool_name`. |
| **Receipt** | An immutable record of one invocation: principal, agent_id, tool, timing, outcome. Emitted by the control plane for every invocation. |
| **ERC-8004** | On-chain registries: Identity (agent registration), Reputation (feedback), Validation (attestations). See [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004). |
| **EIP-8004** | Ethereum Improvement Proposal for agent registration format (Agent Card / registration-v1). |
| **MCP** | Model Context Protocol: transport and tool-call convention between clients and servers. |

---

## 2. Introduction

### 2.1 Problem

- **Discovery** is defined by ERC-8004 (on-chain) and indexes (e.g. subgraphs): what agents exist and how to reach them.
- **Invocation** is defined by MCP (or A2A): how to call a tool on an agent’s server.
- The gap: **who may see which tools, under what policy, and what is recorded** is not standardized. Without a common execution-time layer, every host must reimplement policy, filtering, and audit.

### 2.2 Goal

A single, installable control plane that:

1. Discovers agents from ERC-8004 (and optional indexes).
2. Resolves Agent Cards and MCP (or A2A) endpoints.
3. Applies configurable policy (reputation, validators, risk class, principal).
4. Exposes a **synthesized** tool surface to the host agent (only approved tools).
5. Proxies tool calls to the correct agent and **always** emits a receipt.

### 2.3 Non-goals (out of scope for this RFC)

- Human-facing marketplaces or search UIs.
- Job escrow, payments, pricing, or disputes.
- Replacing ERC-8004 registries or EIP-8004 registration format.
- Per-agent authentication schemes (handled by deployment / env).

---

## 3. Architecture

The control plane has five logical components:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Host agent (e.g. Cursor)                     │
│  list_tools / search_agents / describe_tool / invoke / get_receipt
└───────────────────────────────┬─────────────────────────────────┘
                                │ MCP
┌───────────────────────────────▼─────────────────────────────────┐
│                    CONTROL PLANE (this RFC)                      │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Discovery   │ │ Policy   │ │ Tool         │ │ Invocation   │ │
│  │ (ERC-8004,  │ │ (min rep,│ │ synthesis   │ │ mediation    │ │
│  │  subgraph)  │ │ allowlist│ │ (agent_id:: │ │ + receipts   │ │
│  │             │ │ risk)    │ │  tool_name)  │ │              │ │
│  └─────────────┘ └──────────┘ └──────────────┘ └──────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼───────┐     ┌─────────▼─────────┐   ┌────────▼────────┐
│ ERC-8004      │     │ Subgraph / index  │   │ Agent MCP       │
│ (Identity,    │     │ (optional)         │   │ servers         │
│  Reputation,  │     │                   │   │                 │
│  Validation)  │     │                   │   │                 │
└───────────────┘     └───────────────────┘   └─────────────────┘
```

---

## 4. Specification

### 4.1 Transport and surface

- The control plane is exposed as an **MCP server** (e.g. stdio or SSE).
- It implements the MCP protocol and exposes the tools defined in §4.2–4.6.
- Tool IDs visible to the host MUST be in the form **`agent_id::tool_name`** (e.g. `13445::get_vaults`), where `tool_name` is the name of the tool on the agent’s MCP server.

### 4.2 Discovery tools

#### 4.2.1 `search_agents`

- **Purpose:** Find agents by capability and trust filters.
- **Inputs (recommended):**
  - `capability` (string, optional): Match against agent card description/capabilities.
  - `min_reputation` (number, optional): Minimum reputation score.
  - `min_validations` (number, optional): Minimum validation attestation count.
  - `supported_trust` (string[], optional): e.g. `["reputation","crypto-economic","tee-attestation"]`.
  - `limit` (number, optional): Max agents to return (suggested default 20, max 50).
- **Output:** List of agents with at least: `agent_id`, `name`, `capabilities` or description, trust summary, and when available `mcp_endpoint`.
- **Behavior:** Query ERC-8004 (chain and/or subgraph). Apply policy so that only agents passing the control plane’s policy are returned. Ordering (e.g. by reputation) is implementation-defined.

#### 4.2.2 `resolve_agent`

- **Purpose:** Resolve one agent’s full Agent Card and trust evidence.
- **Inputs:** `agent_id` (number): ERC-8004 agent ID (Identity Registry token ID).
- **Output:** Agent Card (from EIP-8004 registration at `agentURI`), trust summary (reputation/validation), and when applicable MCP endpoint and connection status (`mcp_connected`, `mcp_tool_count`, `mcp_tool_names`).
- **Behavior:** Fetch `tokenURI(agent_id)` from Identity Registry, resolve URI to registration JSON, parse per EIP-8004. Optionally connect to MCP and return tool list.

#### 4.2.3 `list_tools`

- **Purpose:** Return the set of tools the principal is allowed to use (policy-approved).
- **Inputs (recommended):**
  - `agent_ids` (number[], optional): If present, list tools only for these agents (no internal search).
  - `capability` (string, optional): Used when `agent_ids` is omitted to run an internal search first.
  - `min_reputation`, `min_validations`, `supported_trust` (optional): Used when `agent_ids` is omitted.
  - `limit` (number, optional): Max tools (suggested default 50, max 100).
- **Output:** List of tools with at least: `id` (synthesized `agent_id::tool_name`), `name`, `description`, `agent_id`, `agent_name`, `risk_class` (e.g. `read_only` | `side_effecting`), `inputSchema` (JSON Schema).
- **Behavior:** Only tools that pass the control plane’s policy (reputation, validator allowlist, risk class, principal) are included.

#### 4.2.4 `describe_tool`

- **Purpose:** Return provenance, risk, and trust for one synthesized tool.
- **Inputs:** `tool_id` (string): format `agent_id::tool_name`.
- **Output:** `tool_id`, `agent_id`, `tool_name`, provenance (agent name, registry), risk (risk_class, readOnlyHint, destructiveHint), trust (validationCount, feedbackCount, summaryValue).

### 4.3 Invocation

#### 4.3.1 `invoke`

- **Purpose:** Execute a tool on the correct agent and record a receipt.
- **Inputs:**
  - `tool_id` (string): Synthesized ID from `list_tools` (`agent_id::tool_name`).
  - `args` (object): Arguments matching the tool’s `inputSchema`.
- **Output:** Result of the remote tool call plus a **receipt reference** (`receipt_id`).
- **Behavior:**
  - Resolve `tool_id` to agent and MCP endpoint; enforce policy (e.g. risk confirmation if required).
  - Proxy the call to the agent’s MCP server with implementation-defined timeouts and rate limits.
  - Emit a receipt (see §4.5) for every invocation, then return the tool result and `receipt_id`.

### 4.4 Receipts and trust feedback

#### 4.4.1 `get_receipt`

- **Purpose:** Retrieve an execution receipt by ID.
- **Inputs:** `receipt_id` (string).
- **Output:** Receipt object (see §4.5).

#### 4.4.2 Optional tools (implementation-defined)

- **`attest_validation`:** Anchor a validation artifact on the ERC-8004 Validation Registry (optional; requires validator key).
- **`update_reputation`:** Submit reputation feedback (e.g. `giveFeedback`) to the Reputation Registry (optional; async).

### 4.5 Receipt format

Every invocation MUST produce a receipt with at least the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `receipt_id` | string | Unique identifier (e.g. UUID). |
| `principal` | string | Identifier of the principal (e.g. Ethereum address). |
| `agent_id` | number | ERC-8004 agent ID. |
| `tool_name` | string | Tool name on the agent. |
| `tool_id` | string | Synthesized ID (`agent_id::tool_name`). |
| `args_digest` | string \| null | Optional digest of arguments (privacy-preserving). |
| `started_at` | string | ISO 8601 timestamp when invocation started. |
| `ended_at` | string \| null | ISO 8601 timestamp when invocation ended. |
| `outcome` | string | e.g. `"ok"` or `"error"`. |
| `result_digest` | string \| null | Optional digest of result. |
| `error_message` | string \| null | If outcome is error, optional message. |

Receipts are immutable and retained for audit and optional reputation/validation flows.

### 4.6 Identity and session (optional)

- **`whoami`:** Returns the current principal (e.g. Ethereum address) and session scopes. MVP: principal may be derived from configuration (e.g. `PRIVATE_KEY`) or anonymous.

### 4.7 Policy model

The control plane MUST support (at least via configuration) the following policy levers:

| Policy | Description |
|--------|-------------|
| **Minimum reputation** | Agents/tools below a configured reputation threshold are excluded. |
| **Validator allowlist** | Only agents with validations from addresses in a configured set are allowed (optional; empty = no filter). |
| **Risk class** | Allow only `read_only`, only `side_effecting`, or both. |
| **Principal** | Future: principal-scoped policy (e.g. per-wallet allowlists). |

Implementations MAY add rate limits, timeouts, and confirmation rules for high-risk tools.

---

## 5. Relation to EIP-8004 and ERC-8004

- **EIP-8004** defines the Agent Card (registration file) format: `type`, `name`, `description`, `services`, `registrations`, `supportedTrust`, etc. The control plane consumes this format when resolving `agentURI` from the Identity Registry.
- **ERC-8004** defines on-chain registries: Identity (`register(agentURI)`, `tokenURI(agentId)`), Reputation (`giveFeedback`, summary reads), Validation (attestation). The control plane reads from these registries and may write (e.g. validation, reputation) when configured with appropriate keys.
- This RFC does **not** change EIP-8004 or ERC-8004; it specifies the execution-time layer that uses them.

---

## 6. Security and privacy considerations

- **Principals:** The control plane should not expose other principals’ receipts to a given principal; access to receipts should be scoped (e.g. by principal or by receipt_id with authorization).
- **Secrets:** Keys (e.g. `PRIVATE_KEY`) must not be exposed to the host agent; they are used only by the control plane for on-chain writes and principal identification.
- **Invocation:** Proxying to agent MCP servers introduces network and agent risk; timeouts, rate limits, and optional confirmation for side-effecting tools are recommended.

---

## 7. References

- [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) – Agent registration format (registration-v1).
- [ERC-8004 contracts](https://github.com/erc-8004/erc-8004-contracts) – Identity, Reputation, Validation registry deployments.
- Model Context Protocol (MCP) – Tool and resource protocol between clients and servers.
- Attest – Reference implementation of this RFC: policy-aware MCP control plane (this repository).

---

## 8. Changelog

| Date | Change |
|------|--------|
| 2025-02 | Initial RFC (Informational). |

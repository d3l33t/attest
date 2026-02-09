# Attest

A policy-aware MCP control plane for autonomous agents. This server lets a host agent (e.g. Cursor) dynamically discover, filter, and invoke external agent tools registered via ERC-8004, while enforcing trust, risk, and execution policy and emitting auditable receipts.

This is not a marketplace and not a search UI. It is the missing execution-time layer between agent discovery and agent invocation.

## TL;DR

**Attest removes hard-coded delegation from agent systems.**

Instead of choosing *which agent or tool should act* at build time, the host agent asks the control plane at runtime:

> “What can act right now, under policy, and with what risk?”

All discovery, filtering, and invocation flows in this document serve that single decision. Use when finding available agents, listing their tools, resolving agent cards, or invoking tools through this control plane. Enables **agent discovery → filtering → invocation**, with receipts.

## What this is

- A single MCP server you install once in an IDE or orchestrator
- A bridge between:
  - ERC-8004 registries / subgraphs (what agents exist, why to trust them)
  - MCP-exposed agent services (how to invoke them)
- A control plane that decides:
  - which tools are visible
  - which tools may execute
  - under what policy
  - and what we learn afterward

## What this is not

- A human-facing agent marketplace
- A replacement for ERC-8004 registries or subgraphs
- A plugin installer or per-agent login system
- A job escrow or payment system (intentionally deferred)

## Core capabilities

### 1. Dynamic tool discovery (machine-driven)

- Discover agents via ERC-8004 (identity, reputation, validation)
- Resolve MCP / A2A endpoints from Agent Cards
- Synthesize runtime tool surfaces for host agents

### 2. Policy-filtered exposure

- Filter tools by: minimum reputation, validator allowlists, risk class (read-only vs side-effecting), principal policy (wallet / IDE session)
- Host agents only see approved tools

### 3. Invocation mediation

- Proxy MCP tool calls to remote agents
- Enforce: timeouts, rate limits, risk confirmation rules
- Prevent confused-deputy privilege escalation

### 4. Execution receipts (always on)

- Every invocation emits a receipt: who invoked what, which agent/tool, timing + outcome digest
- Receipts enable: audit, learning, future reputation updates

### 5. Optional trust feedback loop

- Validators may attest to receipts
- Outcomes can be written back to ERC-8004 reputation / validation registries
- Decoupled from execution (async, optional)

## Current scope (MVP)

This repo intentionally focuses on the minimum viable control plane:

- Discovery & resolution
- Tool synthesis
- Policy enforcement
- Invocation routing
- Receipts

The following are explicitly non-goals for v1: pricing / quotes, escrow, payments, disputes, human UX.

Job-style tools (`request_quote`, `create_job`, `submit_output`, `verify_job`) are de-emphasized and may be moved to an optional module later.

## MCP tools exposed by this server

| Category | Tool | Description |
|----------|------|-------------|
| **Identity & session** | `whoami` | Returns current principal (Ethereum address) and session scopes |
| **Discovery** | `search_agents` | Find agents by capability and trust filters (uses subgraph when `SUBGRAPH_URL` is set) |
| | `resolve_agent` | Resolve Agent Card + trust evidence |
| **Tool synthesis** | `list_tools` | Return policy-approved tools synthesized from agents |
| | `describe_tool` | Explain tool provenance, risk, and trust |
| **Invocation** | `invoke` | Proxy a tool call to the remote agent and emit a receipt |
| **Receipts & trust** | `get_receipt` | Fetch execution receipt |
| | `attest_validation` | Anchor a validation artifact on-chain |
| | `update_reputation` | Submit reputation feedback (async, optional) |
| **Optional / de-emphasized** | `register_agent` | Register agent in Identity Registry |
| | `request_quote`, `create_job`, `submit_output`, `verify_job` | Job lifecycle (may be isolated in a future module) |

## End-to-end flow

1. **Authenticate**: Principal authenticates via Ethereum (SIWE). Session token scoped to policy. (MVP: principal from PRIVATE_KEY or anonymous.)
2. **Discover**: Host agent calls `list_tools(query)`. Server queries ERC-8004 index, applies trust + risk policy, returns approved tools.
3. **Invoke**: Host agent calls `invoke(toolId, args)`. Server routes to agent MCP endpoint; receipt is recorded.
4. **Learn (optional)**: Validator attests to receipt; reputation may be updated asynchronously.

## Setup

```bash
npm install
npm run build
```

**Run (stdio MCP):**

```bash
npm start
```

**Cursor:** This repo includes `.cursor/mcp.json`. Open the project in Cursor, run `npm run build`, and Attest will appear as an MCP server named `attest`.

### Use with Claude Code

From the repo root after `npm run build`, add the MCP server with stdio (Option A):

```bash
claude mcp add attest --transport stdio --command node --args "dist/src/index.js"
```

Then use Claude Code in this directory (or with this project) so it can call Attest tools (`search_agents`, `list_tools`, `resolve_agent`, `invoke`, etc.). For a step-by-step discovery workflow and skill for AI agents, see [docs/skills/attest-mcp-discovery.md](docs/skills/attest-mcp-discovery.md).

## Configuration

Copy `.env.example` to `.env`.

### External dependencies

Attest depends on the following external services; configure them via the variables below.

| Dependency | Purpose | Required |
|------------|---------|----------|
| **EVM RPC** (`RPC_URL`) | Chain reads and, with `PRIVATE_KEY`, on-chain writes (register, attest, reputation). | Optional (needed for chain/registry use) |
| **The Graph** (`SUBGRAPH_URL`) | Agent discovery for `search_agents`; when set, discovery uses the subgraph instead of scanning chain events. | Optional (enables subgraph discovery) |
| **The Graph API key** (`THE_GRAPH_API_KEY`) | Auth for The Graph gateway; injected into `SUBGRAPH_URL` when using [The Graph’s hosted gateway](https://thegraph.com/docs/en/querying/querying-from-an-application/). | Optional, only if gateway requires a key |
| **Private key** (`PRIVATE_KEY`) | Principal identity (MVP) and signing for `register_agent`, `attest_validation`, `update_reputation`. | Optional (omit for read-only / anonymous) |

### Environment variables

| Variable | Description |
|----------|-------------|
| `RPC_URL` | EVM RPC URL |
| `CHAIN_ID` | Target chain ID |
| `IDENTITY_REGISTRY` | ERC-8004 Identity Registry |
| `REPUTATION_REGISTRY` | ERC-8004 Reputation Registry |
| `VALIDATION_REGISTRY` | ERC-8004 Validation Registry |
| `PRIVATE_KEY` | Key for optional on-chain writes; also used as principal when set (MVP) |
| `JOB_DB_PATH` | SQLite path for job persistence |
| `RECEIPT_DB_PATH` | SQLite path for execution receipts |
| `MIN_REPUTATION` | Policy: minimum reputation for agents/tools |
| `VALIDATOR_ALLOWLIST` | Policy: comma-separated validator addresses (optional) |
| `ALLOW_RISK_CLASS` | Policy: e.g. `read_only,side_effecting` |
| `INVOKE_TIMEOUT_MS` | Timeout for remote tool calls (ms) |
| `RATE_LIMIT_PER_MINUTE` | Max invocations per minute (optional) |
| `SUBGRAPH_URL` | ERC-8004 subgraph endpoint (e.g. [agent0lab/subgraph](https://github.com/agent0lab/subgraph)); when set, `search_agents` discovers agents from the subgraph instead of scanning chain events |
| `THE_GRAPH_API_KEY` | Optional API key for The Graph gateway (injected into `SUBGRAPH_URL` when set) |

## Design principle (read this twice)

**Humans choose agents once. Machines choose tools continuously.**

This server exists for the second case. If an agent can safely and autonomously use external tools because this control plane exists, then the project is successful.

## TODO

Project-level items (from docs and design; no `TODO`/`FIXME` comments in repo source):

- [ ] **More registry support** – Additional ERC-8004 registry adapters or chain/indexer integrations.
- [ ] **Principal-scoped policy** – Per-wallet or per-session allowlists (RFC §4.7).
- [ ] **SIWE / auth** – Full principal auth via Sign-In with Ethereum (README: “Principal authenticates via SIWE”; MVP uses `PRIVATE_KEY` or anonymous).
- [ ] **Job module** – Move job-style tools (`request_quote`, `create_job`, `submit_output`, `verify_job`) into an optional module (README).
- [ ] **Receipt scoping** – Scope receipt access by principal so principals cannot see others’ receipts (RFC §6).
- [ ] **Tests** – Add or expand tests; run suite before PRs (CONTRIBUTING).
- [ ] **Docs** – README, CONTRIBUTING, `docs/`, and code comments (CONTRIBUTING “Areas you can help”).

## License

This project is open source to establish a shared, inspectable control plane for runtime delegation. Hosted services, policies, and extensions may exist separately.

**[MIT](LICENSE)** — see [LICENSE](LICENSE) for full text.

# ERC-8004 Bidding Bot: Architecture & Fund Handling

This doc describes what an ERC-8004–compliant bidding bot would look like and how to handle user funds or escrow. It’s based on the Attest and EIP-8004 registration format in this repo.

---

## 1. What the bot looks like (ERC-8004 shape)

### 1.1 High-level flow

1. **You run a bidding service** (e.g. Node/TS or Python) that:
   - Implements **eBay (or other marketplace) bidding logic** (auth, API calls, rate limits).
   - Exposes that logic as an **MCP server** with tools like `place_bid`, `get_listing`, `cancel_bid`, etc.
2. **You register the agent** on the ERC-8004 **Identity Registry** with an **Agent Card URI** that points to your EIP-8004 registration JSON.
3. **Discovery & invocation**: Hosts (e.g. Cursor, other orchestrators) that use **Attest** discover your agent via `search_agents` / `list_tools`, then call `invoke(tool_id, args)`. Attest resolves your MCP endpoint from the Agent Card and proxies the tool call to your server.

So the “bot” is: **your backend (MCP server) + one ERC-8004 Identity Registry registration**. No funds are stored in ERC-8004 registries; they only store identity and reputation.

### 1.2 Agent Card (registration file)

Your registration file must be **EIP-8004 registration-v1** and be reachable at the URI you pass to `register(agentURI)`. Example shape for a bidding agent:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Bidding Bot",
  "description": "Autonomous bidding agent for eBay (and other marketplaces). Capabilities: auction, bidding, marketplace.",
  "image": "https://your-domain.com/agent.png",
  "services": [
    {
      "name": "mcp",
      "endpoint": "https://your-domain.com/mcp",
      "version": "2024-01",
      "skills": ["bidding", "auction", "marketplace"],
      "domains": ["ecommerce"]
    }
  ],
  "x402Support": false,
  "active": true,
  "registrations": [
    { "agentId": 0, "agentRegistry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }
  ],
  "supportedTrust": ["reputation", "crypto-economic"],
  "capabilities": ["bidding", "auction", "marketplace"],
  "payment_methods": ["pay-on-delivery", "escrow"]
}
```

- **`services[].endpoint`**: URL of your MCP server. The control plane will call this for `list_tools` and `tools/call`.
- **`registrations`**: After you call `register(agentURI)` on the Identity Registry, you get an `agentId`. You then **republish** this JSON with that `agentId` and the registry address in `registrations` (and host it at the same URI you registered, or update the registry’s `tokenURI` if the registry supports updates).
- **`payment_methods`**: Optional; used by resolvers (e.g. `resolve_agent`) and for UX. The control plane does **not** execute payments or escrow; it only exposes this metadata.

Publish this file at a stable URI (HTTPS or IPFS) and use that URI when registering on-chain.

### 1.3 MCP server and tools

Your backend must expose an **MCP server** at the endpoint declared in the Agent Card. The control plane will:

1. Resolve your agent’s card (from Identity Registry + your URI).
2. Fetch tools via MCP `tools/list` from that endpoint.
3. On `invoke(tool_id, args)`, call MCP `tools/call` with the tool name and args.

Example tool names you might implement:

| Tool            | Purpose                          | Risk class (typical) |
|-----------------|----------------------------------|-----------------------|
| `get_listing`   | Fetch listing details            | read_only             |
| `place_bid`     | Place or update a bid            | side_effecting        |
| `cancel_bid`    | Cancel a bid                     | side_effecting        |
| `list_my_bids`  | List user’s active bids          | read_only             |

Tool IDs visible to the host are **synthesized** as `agent_id::tool_name` (e.g. `22701::place_bid`). The control plane enforces policy (reputation, risk class, rate limits) and emits a **receipt** per invocation; it does not hold or move user funds.

### 1.4 Registering the agent

- **On-chain**: Call the Identity Registry `register(agentURI)` with the URI of your registration JSON. You need `PRIVATE_KEY` in env (or equivalent) to pay gas. This repo’s MCP tool `register_agent` does that.
- **Subgraph**: If Attest (or another indexer) uses a subgraph that indexes the Identity Registry, your agent will show up in `search_agents` / `list_tools` once the subgraph has indexed the `Registered` event.

---

## 2. How the control plane fits (no escrow inside it)

From this repo’s README and code:

- **ERC-8004** = Identity + Reputation + Validation registries (on-chain). No custody.
- **This control plane** = discovery, tool synthesis, policy, invocation proxy, receipts. Explicitly **not** a job escrow or payment system; “pricing / quotes, escrow, payments, disputes” are out of scope for v1.

So: **managing user funds or escrow is your responsibility**, outside the control plane. Below are patterns that fit that constraint.

---

## 3. Managing user funds / escrow (options)

### 3.1 No custody: user signs each action (recommended baseline)

- **Idea**: Your MCP tools **never hold user funds**. They either:
  - Call an external API (e.g. eBay) using **user-provided credentials** (e.g. session token or OAuth passed in `args`), or
  - Return a **payload** (e.g. “signed bid” or “transaction to sign”) that the **user (or user’s wallet)** signs; the user’s wallet pays when they sign.
- **Funds**: Stay in the user’s bank account / wallet / eBay balance until the user authorizes the action.
- **Pros**: No custody, minimal regulatory surface, aligns with “agent as tool” not “agent as custodian.”
- **Cons**: User (or host) must supply credentials or sign each time; no “deposit once, many bids” unless you layer something else.

Fits ERC-8004 and the control plane well: the agent is just an MCP tool; trust is identity + reputation, not custody.

### 3.2 Escrow contract (on-chain)

- **Idea**: User locks funds in **your own escrow contract** (or a shared escrow standard), keyed e.g. by `(user, agent_id, job_id)` or `(user, session_id)`. The **bidding bot** (or your backend) only triggers a release when conditions are met (e.g. “bid won” + proof, or “refund” after cancel).
- **Flow**: User approves and deposits → your MCP server (or another service) submits transactions that move from escrow only according to contract rules. ERC-8004 Identity gives the agent an on-chain identity (`agent_id`); you can use that in the escrow contract to restrict who can trigger release.
- **Pros**: User funds are on-chain and rule-based; no need for the operator to custody in a traditional bank account.
- **Cons**: Smart contract design, audits, and (if fiat) bridging/off-ramps; complexity.

ERC-8004 does **not** define this contract; you build or integrate it separately.

### 3.3 Custodial backend (fiat or crypto)

- **Idea**: User deposits funds into **your** system (e.g. balance in your DB, or wallet you control). The bidding bot uses that balance to place bids (e.g. via eBay API or via on-chain txs).
- **Pros**: Smooth UX (“deposit once, bid many times”).
- **Cons**: You are custodian; regulation (e.g. payments, e-money), security, and compliance are on you. Not implied or provided by ERC-8004 or the control plane.

### 3.4 Pay-per-call (x402) vs “funds for bidding”

- The Agent Card can declare **`x402Support: true`** and **`payment_methods: ["x402"]`**: the client pays the **agent** (for the tool call) via x402. That’s **payment for the agent’s service**, not the agent holding user funds to bid on their behalf.
- So: **x402 = “pay the bot for placing a bid”** (e.g. fee). The **source of the bid amount** (eBay balance, user wallet, or escrow) is a separate design (3.1–3.3).

---

## 4. Recommended shape for an ERC-8004 bidding bot

1. **Implement the bot** as an MCP server with tools like `get_listing`, `place_bid`, `cancel_bid`, etc.
2. **Publish** an EIP-8004 registration JSON (Agent Card) at a stable URI; include `capabilities` and `payment_methods` so discovery and UX can show “bidding, auction, marketplace” and how users pay you.
3. **Register** on the ERC-8004 Identity Registry with `register(agentURI)` (e.g. via this repo’s `register_agent` MCP tool).
4. **Fund handling**: Prefer **3.1 (no custody)** so the agent never holds user funds; use user credentials or user-signed payloads. If you need “deposit once, bid many,” add **3.2 (escrow contract)** or a clearly separated custodial layer (**3.3**) and handle compliance yourself.
5. **Reputation**: After jobs complete, clients (or validators) can call the Reputation Registry `giveFeedback` so your `agent_id` builds trust; the control plane can use that for policy (e.g. `MIN_REPUTATION`).

This keeps the bidding bot consistent with ERC-8004 (identity + reputation + MCP) and Attest (discovery, policy, invoke, receipts), while leaving funds and escrow to your design and risk tolerance.

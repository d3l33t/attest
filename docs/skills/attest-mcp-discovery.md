---
name: attest-mcp-discovery
description: Discover agents and tools via the Attest ERC-8004 agent control plane MCP server. Use when finding available agents, listing their tools, resolving agent cards, or invoking tools through this control plane.
---

# Discovering agents and tools via Attest

This skill describes how to find agents and their tools using the **Attest** MCP server. The server exposes discovery tools that query ERC-8004 registries (and optional subgraph), apply policy, and synthesize a tool surface for invocation.

## When to use this skill

- User asks which agents are available, or to search/filter agents.
- User wants to list tools from specific agents or from the whole approved set.
- User needs agent details (Agent Card, trust, MCP endpoint) or tool details (provenance, risk, trust).
- User wants to call a remote agent tool through the control plane.

## Prerequisites

- The **Attest** MCP server must be configured and running (e.g. in Cursor via `.cursor/mcp.json`, in Claude Code via `claude mcp add attest --transport stdio ...`, or stdio).
- For agent search: either `SUBGRAPH_URL` (recommended) or chain-based discovery must be configured.

## Discovery workflow

### 1. Find agents — `search_agents`

Discover agents by capability and trust filters.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|--------------|
| `capability` | string | Filter by capability or description (e.g. `"DeFi"`, `"payments"`, `"banking"`, `"yield"`). Matches agent card `capabilities` and `description`. |
| `min_reputation` | number | Minimum reputation (e.g. 0–100 scale). |
| `min_validations` | number | Minimum number of validation attestations. |
| `supported_trust` | string[] | Filter by trust types: `reputation`, `crypto-economic`, `tee-attestation`. |
| `limit` | number | Max agents to return (default 20, max 50). |

**Example:** Find agents related to banking or payments:

```json
{ "capability": "banking", "limit": 10 }
```

or

```json
{ "capability": "payments", "supported_trust": ["reputation", "crypto-economic"] }
```

**Returns:** `{ "agents": [ { "agent_id", "name", "capabilities", "score", "why", "trust", "mcp_endpoint" }, ... ] }`.

Use `agent_id` and optionally `mcp_endpoint` for the next steps.

### 2. Get full agent details — `resolve_agent`

Resolve a single agent's Agent Card and trust evidence.

**Parameters:** `agent_id` (number).

**Returns:** `{ "card": { ... }, "trust": { ... }, "mcp_endpoint"?, "mcp_connected"?, "mcp_tool_count"?, "mcp_tool_names"? }`. If the agent has an MCP server and passes policy, `mcp_connected` is `true` and tool count/names are included.

Use this when you need the full card, contract address, MCP/A2A endpoints, or trust breakdown.

### 2b. Connect to an agent's MCP — `connect_to_agent`

When an agent with an MCP server is found (e.g. from `search_agents` or `resolve_agent`), you can **connect to it explicitly** with `connect_to_agent(agent_id)`. This verifies the endpoint and returns tool count and names so the agent is ready for `list_tools` and `invoke`. Prefer `resolve_agent` first (it auto-connects); use `connect_to_agent` to confirm connection or refresh tool list for a known agent.

### 3. List tools — `list_tools`

Get policy-approved tools from specific agents. Only tools that pass the control plane's policy (reputation, risk class, etc.) are returned.

**Recommended flow (faster, smaller context):** Call **`search_agents` first**, then **`list_tools` with `agent_ids`** from the search result. When `agent_ids` is provided, `list_tools` skips its own search and only fetches tools for those agents.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|--------------|
| `agent_ids` | number[] | **Preferred.** Agent IDs to list tools for (e.g. from `search_agents`). When set, no search is run — only these agents are resolved and their tools fetched. |
| `limit` | number | Max tools to return (default 50, max 100). |
| `capability` | string | Used only when `agent_ids` is omitted: runs a search and then lists tools from matching agents. |
| `min_reputation` | number | Used only when `agent_ids` is omitted. |
| `min_validations` | number | Used only when `agent_ids` is omitted. |
| `supported_trust` | string[] | Used only when `agent_ids` is omitted. |

**Example (recommended):** Search, then list tools for chosen agents:

```json
// 1) search_agents({ "capability": "banking", "limit": 5 })
// 2) list_tools({ "agent_ids": [13445, 13446], "limit": 50 })
```

**Example:** Tools from one agent by ID:

```json
{ "agent_ids": [13445], "limit": 50 }
```

**Example (no prior search):** Tools from all agents matching a domain (slower; runs search internally):

```json
{ "capability": "banking", "limit": 30 }
```

**Returns:** `{ "tools": [ { "id", "name", "description", "agent_id", "agent_name", "risk_class", "inputSchema" }, ... ] }`.

Tool IDs are in the form **`agent_id::tool_name`** (e.g. `13445::get_vaults`). Use `id` for `describe_tool` and `invoke`.

### 4. Describe a tool — `describe_tool`

Get provenance, risk class, and trust for a synthesized tool.

**Parameters:** `tool_id` (string) — format `agent_id::tool_name`.

**Returns:** `{ "tool_id", "agent_id", "tool_name", "provenance": { "agent_id", "name", "agentRegistry" }, "risk": { "risk_class", "readOnlyHint", "destructiveHint" }, "trust": { "validationCount", "feedbackCount", "summaryValue" } }`.

Use before invoking to confirm the right tool and risk (read_only vs side_effecting).

### 5. Invoke a tool — `invoke`

Execute a remote agent tool through the control plane. A receipt is emitted for every invocation.

**Parameters:**

- `tool_id` (string): synthesized ID from `list_tools` (e.g. `13445::get_vaults`).
- `args` (object): arguments for the tool's `inputSchema`.

**Returns:** Invocation result plus receipt reference. Use `get_receipt` with the returned `receipt_id` for audit details.

## Seeking "bank" or domain-specific agents and tools

To find agents and tools in a specific domain (e.g. banking, payments, DeFi):

1. **Search by capability:** Call `search_agents` with `capability` set to a domain term (e.g. `"banking"`, `"payments"`, `"DeFi"`, `"remittance"`). Matching is text-based on agent card capabilities and description.
2. **Optional trust filters:** Use `supported_trust` and `min_reputation` to narrow to higher-trust agents.
3. **Get their tools:** Call `list_tools` with `agent_ids` set to the IDs from step 1 (recommended — faster and smaller context). Alternatively, call `list_tools` with only `capability` to run a search internally (slower).
4. **Inspect before use:** For any tool of interest, call `describe_tool(tool_id)` to see provenance and risk, then `invoke(tool_id, args)` to run it.

## Auto-connect when an MCP server is found

- **resolve_agent:** If the resolved agent has an MCP endpoint and passes policy, the control plane connects automatically and returns `mcp_connected: true`, `mcp_tool_count`, and `mcp_tool_names`. The agent is then ready for `list_tools(agent_ids: [id])` and `invoke`.
- **connect_to_agent:** Call with `agent_id` to explicitly connect to an agent's MCP server (e.g. after finding one via `search_agents`). Returns `connected`, `tool_count`, `tool_names` so you can proceed to list and invoke tools.

## Quick reference: MCP tool names

| Goal | MCP tool | Key args |
|------|----------|----------|
| Find agents | `search_agents` | `capability`, `min_reputation`, `supported_trust`, `limit` |
| Agent details (auto-connects if MCP) | `resolve_agent` | `agent_id` |
| Connect to agent MCP | `connect_to_agent` | `agent_id` |
| List tools | `list_tools` | `capability`, `agent_ids`, `limit` |
| Tool details | `describe_tool` | `tool_id` |
| Run a tool | `invoke` | `tool_id`, `args` |
| Get receipt | `get_receipt` | `receipt_id` |

## Policy and behavior notes

- **Visibility:** Only agents/tools that pass the control plane's policy (e.g. `MIN_REPUTATION`, `ALLOW_RISK_CLASS`, `VALIDATOR_ALLOWLIST`) appear in `list_tools`.
- **Tool IDs:** Always use the synthesized `id` from `list_tools` (`agent_id::tool_name`). Don't invent IDs.
- **Risk:** Tools are classified as `read_only` or `side_effecting`. Policy may restrict which risk classes are allowed; `describe_tool` shows the risk for a given tool.

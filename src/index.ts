#!/usr/bin/env node
import "dotenv/config";

/**
 * erc8004-agent-control-plane MCP server entry.
 * Policy-aware control plane: whoami, search_agents, resolve_agent, list_tools, describe_tool, invoke, get_receipt;
 * trust: attest_validation, update_reputation; job lifecycle (de-emphasized): request_quote, create_job, submit_output, verify_job; register_agent.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveAgent } from "./tools/resolve_agent.js";
import { connectToAgent } from "./tools/connect_to_agent.js";
import { searchAgents } from "./tools/search_agents.js";
// import { registerAgentTool } from "./tools/register_agent.js";
// import { requestQuote } from "./tools/request_quote.js";
// import { createJobTool } from "./tools/create_job.js";
// import { submitOutput } from "./tools/submit_output.js";
// import { verifyJobTool } from "./tools/verify_job.js";
import { attestValidation } from "./tools/attest_validation.js";
import { updateReputation } from "./tools/update_reputation.js";
import { whoami } from "./tools/whoami.js";
import { listTools } from "./tools/list_tools.js";
import { describeTool } from "./tools/describe_tool.js";
import { invokeTool } from "./tools/invoke.js";
import { getReceiptTool } from "./tools/get_receipt.js";

const server = new McpServer({
  name: "erc8004-agent-control-plane",
  version: "0.1.0",
});

// whoami
server.tool("whoami", {}, async () => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(whoami(), null, 2),
    },
  ],
}));

// list_tools
server.tool(
  "list_tools",
  {
    capability: z.string().optional(),
    min_reputation: z.number().optional(),
    min_validations: z.number().optional(),
    supported_trust: z.array(z.string()).optional(),
    limit: z.number().optional(),
    agent_ids: z.array(z.number()).optional(),
  },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(await listTools({
          capability: args.capability,
          min_reputation: args.min_reputation,
          min_validations: args.min_validations,
          supported_trust: args.supported_trust,
          limit: args.limit,
          agent_ids: args.agent_ids,
        }), null, 2),
      },
    ],
  })
);

// describe_tool
server.tool(
  "describe_tool",
  { tool_id: z.string() },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(await describeTool({ tool_id: args.tool_id }), null, 2),
      },
    ],
  })
);

// invoke
server.tool(
  "invoke",
  {
    tool_id: z.string(),
    args: z.record(z.unknown()),
  },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(await invokeTool({ tool_id: args.tool_id, args: args.args ?? {} }), null, 2),
      },
    ],
  })
);

// get_receipt
server.tool(
  "get_receipt",
  { receipt_id: z.string() },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(getReceiptTool({ receipt_id: args.receipt_id }) ?? { error: "Receipt not found" }, null, 2),
      },
    ],
  })
);

// resolve_agent
server.tool(
  "resolve_agent",
  { agent_id: z.number() },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(await resolveAgent({ agent_id: args.agent_id }), null, 2),
      },
    ],
  })
);

// connect_to_agent — connect to an agent's MCP server when found (enables list_tools/invoke)
server.tool(
  "connect_to_agent",
  { agent_id: z.number() },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(await connectToAgent({ agent_id: args.agent_id }), null, 2),
      },
    ],
  })
);

// search_agents
server.tool(
  "search_agents",
  {
    capability: z.string().optional(),
    min_reputation: z.number().optional(),
    min_validations: z.number().optional(),
    supported_trust: z.array(z.string()).optional(),
    limit: z.number().optional(),
  },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          await searchAgents({
            capability: args.capability,
            min_reputation: args.min_reputation,
            min_validations: args.min_validations,
            supported_trust: args.supported_trust,
            limit: args.limit,
          }),
          null,
          2
        ),
      },
    ],
  })
);

// register_agent (unused / de-emphasized)
// server.tool(
//   "register_agent",
//   { agentCardUri: z.string() },
//   async (args) => ({
//     content: [
//       {
//         type: "text" as const,
//         text: JSON.stringify(
//           await registerAgentTool({ agentCardUri: args.agentCardUri }),
//           null,
//           2
//         ),
//       },
//     ],
//   })
// );

// request_quote (unused / de-emphasized)
// server.tool(
//   "request_quote",
//   {
//     agent_id: z.number(),
//     job_spec: z.object({
//       objective: z.string(),
//       acceptance_criteria: z.array(z.string()).optional(),
//       inputs: z.record(z.string()).optional(),
//       constraints: z
//         .object({
//           time: z.string().optional(),
//           budget: z.string().optional(),
//           toolchain: z.array(z.string()).optional(),
//         })
//         .optional(),
//       deliverables: z.array(z.string()).optional(),
//       verification_plan: z.string().optional(),
//     }),
//   },
//   async (args) => ({
//     content: [
//       {
//         type: "text" as const,
//         text: JSON.stringify(
//           await requestQuote({
//             agent_id: args.agent_id,
//             job_spec: args.job_spec,
//           }),
//           null,
//           2
//         ),
//       },
//     ],
//   })
// );

// create_job (unused / de-emphasized)
// server.tool(
//   "create_job",
//   {
//     agent_id: z.number(),
//     accepted_quote: z.object({
//       price: z.string().optional(),
//       timeline: z.string().optional(),
//       verification_mode: z.string().optional(),
//       payment_terms: z.string().optional(),
//     }),
//     job_spec: z.object({
//       objective: z.string(),
//       acceptance_criteria: z.array(z.string()).optional(),
//       inputs: z.record(z.string()).optional(),
//       constraints: z
//         .object({
//           time: z.string().optional(),
//           budget: z.string().optional(),
//           toolchain: z.array(z.string()).optional(),
//         })
//         .optional(),
//       deliverables: z.array(z.string()).optional(),
//       verification_plan: z.string().optional(),
//     }),
//   },
//   async (args) => ({
//     content: [
//       {
//         type: "text" as const,
//         text: JSON.stringify(
//           await createJobTool({
//             agent_id: args.agent_id,
//             accepted_quote: args.accepted_quote,
//             job_spec: args.job_spec,
//           }),
//           null,
//           2
//         ),
//       },
//     ],
//   })
// );

// submit_output (unused / de-emphasized)
// server.tool(
//   "submit_output",
//   {
//     job_id: z.string(),
//     output_refs: z.array(z.string()),
//   },
//   async (args) => ({
//     content: [
//       {
//         type: "text" as const,
//         text: JSON.stringify(
//           await submitOutput({
//             job_id: args.job_id,
//             output_refs: args.output_refs,
//           }),
//           null,
//           2
//         ),
//       },
//     ],
//   })
// );

// verify_job (unused / de-emphasized)
// server.tool(
//   "verify_job",
//   {
//     job_id: z.string(),
//     verifier_profile: z
//       .object({
//         expected_hash: z.string().optional(),
//         run_command: z.string().optional(),
//       })
//       .optional(),
//   },
//   async (args) => ({
//     content: [
//       {
//         type: "text" as const,
//         text: JSON.stringify(
//           await verifyJobTool({
//             job_id: args.job_id,
//             verifier_profile: args.verifier_profile,
//           }),
//           null,
//           2
//         ),
//       },
//     ],
//   })
// );

// attest_validation
server.tool(
  "attest_validation",
  {
    job_id: z.string(),
    validation_artifact: z
      .object({
        job_id: z.string(),
        output_hash: z.string(),
        verifier_id: z.string(),
        verification_result: z.enum(["pass", "fail"]),
        metrics: z.record(z.union([z.number(), z.string()])).optional(),
        evidence_uris: z.array(z.string()).optional(),
      })
      .optional(),
    update_reputation: z.boolean().optional(),
  },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          await attestValidation({
            job_id: args.job_id,
            validation_artifact: args.validation_artifact,
            update_reputation: args.update_reputation,
          }),
          null,
          2
        ),
      },
    ],
  })
);

// update_reputation
server.tool(
  "update_reputation",
  {
    job_id: z.string(),
    outcome: z.enum(["success", "fail"]),
    tag1: z.string().optional(),
    tag2: z.string().optional(),
  },
  async (args) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          await updateReputation({
            job_id: args.job_id,
            outcome: args.outcome,
            tag1: args.tag1,
            tag2: args.tag2,
          }),
          null,
          2
        ),
      },
    ],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);

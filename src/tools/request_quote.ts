/**
 * MCP tool: request_quote(agent_id, job_spec) — get price/timeline/verification from provider.
 * MVP: stub quote; later call provider A2A/MCP endpoint.
 */

import type { JobSpec } from "../types/schemas.js";
import { resolveAgentCard } from "../resolver/agent-card.js";

export const name = "request_quote";
export const description =
  "Request a quote from an agent for a job. Sends job_spec (objective, acceptance criteria, inputs, constraints, deliverables, verification plan). Returns a stub quote (price, timeline, verification mode, payment terms). For MVP this is a local stub; later can call the agent's A2A/MCP endpoint.";

export const argsSchema = {
  type: "object" as const,
  properties: {
    agent_id: { type: "number", description: "ERC-8004 agent ID." },
    job_spec: {
      type: "object",
      description: "Job specification: objective, acceptance_criteria, inputs, constraints, deliverables, verification_plan",
      properties: {
        objective: { type: "string" },
        acceptance_criteria: { type: "array", items: { type: "string" } },
        inputs: { type: "object" },
        constraints: {
          type: "object",
          properties: {
            time: { type: "string" },
            budget: { type: "string" },
            toolchain: { type: "array", items: { type: "string" } },
          },
        },
        deliverables: { type: "array", items: { type: "string" } },
        verification_plan: { type: "string" },
      },
    },
  },
  required: ["agent_id", "job_spec"],
  additionalProperties: false,
};

export interface RequestQuoteArgs {
  agent_id: number;
  job_spec: JobSpec;
}

export interface QuoteResult {
  price?: string;
  timeline?: string;
  verification_mode?: string;
  payment_terms?: string;
  provider_name?: string;
}

export async function requestQuote(
  args: RequestQuoteArgs
): Promise<QuoteResult> {
  const card = await resolveAgentCard(args.agent_id);
  return {
    price: card.pricing?.min != null ? `${card.pricing.min}` : "0",
    timeline: "TBD",
    verification_mode: card.verification_supported[0] ?? "hash",
    payment_terms: card.payment_methods[0] ?? "pay-on-delivery",
    provider_name: card.name,
  };
}

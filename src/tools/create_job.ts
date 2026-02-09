/**
 * MCP tool: create_job(agent_id, accepted_quote, job_spec) — open job record.
 */

import type { JobSpec, AcceptedQuote } from "../types/schemas.js";
import { createJob } from "../orchestrator/job.js";

export const name = "create_job";
export const description =
  "Create a job record after accepting a quote. Stores agent_id, accepted_quote, and job_spec; status is set to accepted. Returns job_id.";

export const argsSchema = {
  type: "object" as const,
  properties: {
    agent_id: { type: "number", description: "ERC-8004 agent ID (provider)." },
    accepted_quote: {
      type: "object",
      description: "Accepted quote from request_quote.",
      properties: {
        price: { type: "string" },
        timeline: { type: "string" },
        verification_mode: { type: "string" },
        payment_terms: { type: "string" },
      },
    },
    job_spec: {
      type: "object",
      description: "Job specification.",
      properties: {
        objective: { type: "string" },
        acceptance_criteria: { type: "array", items: { type: "string" } },
        inputs: { type: "object" },
        constraints: { type: "object" },
        deliverables: { type: "array", items: { type: "string" } },
        verification_plan: { type: "string" },
      },
    },
  },
  required: ["agent_id", "accepted_quote", "job_spec"],
  additionalProperties: false,
};

export interface CreateJobArgs {
  agent_id: number;
  accepted_quote: AcceptedQuote;
  job_spec: JobSpec;
}

export async function createJobTool(
  args: CreateJobArgs
): Promise<{ job_id: string }> {
  const job = createJob(args.agent_id, args.job_spec, args.accepted_quote, "accepted");
  return { job_id: job.job_id };
}

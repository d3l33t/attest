/**
 * MCP tool: update_reputation(job_id, outcome) — write feedback to Reputation Registry.
 */

import { updateReputationForJob } from "../reputation/writer.js";

export const name = "update_reputation";
export const description =
  "Update an agent's reputation based on job outcome. Calls ERC-8004 Reputation Registry giveFeedback. Requires PRIVATE_KEY (client/requester address).";

export const argsSchema = {
  type: "object" as const,
  properties: {
    job_id: { type: "string", description: "Job ID." },
    outcome: {
      type: "string",
      enum: ["success", "fail"],
      description: "Outcome to record (e.g. success=100, fail=0).",
    },
    tag1: {
      type: "string",
      description: "Optional tag for filtering (default: job_outcome).",
    },
    tag2: { type: "string", description: "Optional second tag." },
  },
  required: ["job_id", "outcome"],
  additionalProperties: false,
};

export interface UpdateReputationArgs {
  job_id: string;
  outcome: "success" | "fail";
  tag1?: string;
  tag2?: string;
}

export async function updateReputation(
  args: UpdateReputationArgs
): Promise<{ job_id: string; txHash: string }> {
  const txHash = await updateReputationForJob(
    args.job_id,
    args.outcome,
    args.tag1 ?? "job_outcome",
    args.tag2 ?? ""
  );
  return { job_id: args.job_id, txHash };
}

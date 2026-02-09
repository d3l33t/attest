/**
 * MCP tool: submit_output(job_id, output_refs) — store output references for verification.
 */

import { getJob, setOutputRefs, updateJobStatus } from "../orchestrator/job.js";

export const name = "submit_output";
export const description =
  "Submit output references for a job (e.g. file hashes, URIs, PR link). Stored for verify_job to run checks against.";

export const argsSchema = {
  type: "object" as const,
  properties: {
    job_id: { type: "string", description: "Job ID from create_job." },
    output_refs: {
      type: "array",
      items: { type: "string" },
      description: "List of output references (URIs, hashes, or content snippets).",
    },
  },
  required: ["job_id", "output_refs"],
  additionalProperties: false,
};

export interface SubmitOutputArgs {
  job_id: string;
  output_refs: string[];
}

export async function submitOutput(
  args: SubmitOutputArgs
): Promise<{ job_id: string; status: string }> {
  const job = getJob(args.job_id);
  if (!job) throw new Error(`Job not found: ${args.job_id}`);
  setOutputRefs(args.job_id, args.output_refs);
  updateJobStatus(args.job_id, "verifying");
  return { job_id: args.job_id, status: "verifying" };
}

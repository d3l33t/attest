/**
 * Reputation Writer: map validated job outcome to ERC-8004 giveFeedback (and optionally validation response).
 */

import { giveFeedback } from "../registry/adapter.js";
import type { ValidationArtifact } from "../types/schemas.js";
import { getJob } from "../orchestrator/job.js";

/** Submit reputation feedback for a job outcome. value 0-100, valueDecimals 0. */
export async function updateReputationForJob(
  job_id: string,
  outcome: "success" | "fail",
  tag1 = "job_outcome",
  tag2 = ""
): Promise<string> {
  const job = getJob(job_id);
  if (!job) throw new Error(`Job not found: ${job_id}`);
  const value = outcome === "success" ? 100 : 0;
  const txHash = await giveFeedback(
    BigInt(job.agent_id),
    value,
    0,
    tag1,
    tag2,
    "",
    "",
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  );
  return txHash;
}

/** Map ValidationArtifact result to outcome for reputation. */
export function artifactToOutcome(artifact: ValidationArtifact): "success" | "fail" {
  return artifact.verification_result === "pass" ? "success" : "fail";
}

/**
 * MCP tool: verify_job(job_id, verifier_profile) — run Verification Engine, produce ValidationArtifact.
 */

import { runVerification } from "../verification/engine.js";
import type { VerifierProfile } from "../verification/engine.js";
import { getJob, setValidationArtifact, updateJobStatus } from "../orchestrator/job.js";

export const name = "verify_job";
export const description =
  "Run verification on a job's output. Uses verifier_profile (optional expected_hash, optional run_command). Produces a ValidationArtifact (pass/fail) and stores it on the job.";

export const argsSchema = {
  type: "object" as const,
  properties: {
    job_id: { type: "string", description: "Job ID." },
    verifier_profile: {
      type: "object",
      description: "Verifier options: expected_hash (optional), run_command (optional shell command).",
      properties: {
        expected_hash: { type: "string" },
        run_command: { type: "string" },
      },
    },
  },
  required: ["job_id"],
  additionalProperties: false,
};

export interface VerifyJobArgs {
  job_id: string;
  verifier_profile?: VerifierProfile;
}

export async function verifyJobTool(
  args: VerifyJobArgs
): Promise<{ job_id: string; verification_result: string; artifact: unknown }> {
  const job = getJob(args.job_id);
  if (!job) throw new Error(`Job not found: ${args.job_id}`);
  const profile = args.verifier_profile ?? {};
  const artifact = await runVerification(args.job_id, profile);
  setValidationArtifact(args.job_id, artifact);
  updateJobStatus(
    args.job_id,
    artifact.verification_result === "pass" ? "settled" : "failed"
  );
  return {
    job_id: args.job_id,
    verification_result: artifact.verification_result,
    artifact: {
      job_id: artifact.job_id,
      output_hash: artifact.output_hash,
      verifier_id: artifact.verifier_id,
      verification_result: artifact.verification_result,
      metrics: artifact.metrics,
      evidence_uris: artifact.evidence_uris,
    },
  };
}

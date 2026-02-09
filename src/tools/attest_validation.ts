/**
 * MCP tool: attest_validation(job_id, validation_artifact?) — anchor proof in Validation Registry.
 * Optionally update reputation after attestation.
 */

import { keccak256, stringToHex } from "viem";
import {
  validationRequest,
  validationResponse,
  getWallet,
} from "../registry/adapter.js";
import { getJob } from "../orchestrator/job.js";
import type { ValidationArtifact } from "../types/schemas.js";
import {
  updateReputationForJob,
  artifactToOutcome,
} from "../reputation/writer.js";

export const name = "attest_validation";
export const description =
  "Anchor the job's validation result on the ERC-8004 Validation Registry. Uses the job's stored validation_artifact (or pass one). Requires PRIVATE_KEY for the validator wallet; validator address must be configured. Optionally updates reputation (giveFeedback) after attestation.";

export const argsSchema = {
  type: "object" as const,
  properties: {
    job_id: { type: "string", description: "Job ID." },
    validation_artifact: {
      type: "object",
      description: "Optional; if omitted, uses the artifact stored on the job from verify_job.",
      properties: {
        job_id: { type: "string" },
        output_hash: { type: "string" },
        verifier_id: { type: "string" },
        verification_result: { type: "string", enum: ["pass", "fail"] },
        metrics: { type: "object" },
        evidence_uris: { type: "array", items: { type: "string" } },
      },
    },
    update_reputation: {
      type: "boolean",
      description: "If true, call giveFeedback after attestation (requires PRIVATE_KEY as feedback giver).",
    },
  },
  required: ["job_id"],
  additionalProperties: false,
};

export interface AttestValidationArgs {
  job_id: string;
  validation_artifact?: ValidationArtifact;
  update_reputation?: boolean;
}

export async function attestValidation(
  args: AttestValidationArgs
): Promise<{
  job_id: string;
  requestHash: string;
  validationResponseTx?: string;
  reputationTx?: string;
}> {
  const job = getJob(args.job_id);
  if (!job) throw new Error(`Job not found: ${args.job_id}`);
  const artifact =
    args.validation_artifact ?? job.validation_artifact;
  if (!artifact)
    throw new Error(
      `No validation_artifact for job ${args.job_id}; run verify_job first or pass validation_artifact.`
    );

  const wallet = getWallet();
  if (!wallet?.account)
    throw new Error("PRIVATE_KEY required for attest_validation (validator)");
  const validatorAddress = wallet.account.address;

  const payload = JSON.stringify(artifact);
  const requestHash = keccak256(stringToHex(payload));
  const requestURI = ""; // Off-chain artifact; optional IPFS link later

  await validationRequest(
    validatorAddress as `0x${string}`,
    BigInt(job.agent_id),
    requestURI,
    requestHash as `0x${string}`
  );

  const response =
    artifact.verification_result === "pass" ? 100 : 0;
  const responseTx = await validationResponse(
    requestHash as `0x${string}`,
    response,
    "",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
    `job:${args.job_id}`
  );

  let reputationTx: string | undefined;
  if (args.update_reputation) {
    reputationTx = await updateReputationForJob(
      args.job_id,
      artifactToOutcome(artifact)
    );
  }

  return {
    job_id: args.job_id,
    requestHash,
    validationResponseTx: responseTx,
    reputationTx,
  };
}

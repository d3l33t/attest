/**
 * Verification Engine: pluggable verifiers (MVP: hash + one deterministic check).
 * Produces ValidationArtifact for attestation.
 */

import { createHash } from "node:crypto";
import type { ValidationArtifact } from "../types/schemas.js";
import { getJob } from "../orchestrator/job.js";

const VERIFIER_ID = "erc8004-agent-hub";

/** Compute SHA-256 hash of a string (e.g. output content or refs). */
export function hashOutput(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** MVP: single deterministic check — hash of output_refs matches expected or we run a simple check. */
export interface VerifierProfile {
  /** If set, verification passes only if output_hash matches this. */
  expected_hash?: string;
  /** Optional: run a shell command (e.g. test script); pass if exit code 0. */
  run_command?: string;
}

export async function runVerification(
  job_id: string,
  verifierProfile: VerifierProfile
): Promise<ValidationArtifact> {
  const job = getJob(job_id);
  if (!job) throw new Error(`Job not found: ${job_id}`);
  if (!job.output_refs?.length) throw new Error(`Job ${job_id} has no output_refs`);

  const outputContent = job.output_refs.join("\n");
  const output_hash = hashOutput(outputContent);

  let pass = true;
  const metrics: Record<string, number | string> = {
    output_refs_count: job.output_refs.length,
    output_hash,
  };

  if (verifierProfile.expected_hash != null) {
    if (output_hash !== verifierProfile.expected_hash) pass = false;
    metrics.expected_hash_match = output_hash === verifierProfile.expected_hash ? 1 : 0;
  }

  if (verifierProfile.run_command && pass) {
    try {
      const { execSync } = await import("node:child_process");
      execSync(verifierProfile.run_command, {
        encoding: "utf8",
        timeout: 30_000,
      });
      metrics.command_exit = 0;
    } catch (err) {
      pass = false;
      metrics.command_exit = (err as { status?: number }).status ?? -1;
    }
  }

  const artifact: ValidationArtifact = {
    job_id,
    output_hash,
    verifier_id: VERIFIER_ID,
    verification_result: pass ? "pass" : "fail",
    metrics,
    evidence_uris: job.output_refs,
  };
  return artifact;
}

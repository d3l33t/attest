/**
 * Data models for erc8004-agent-hub: Agent Card, Job Spec, Validation Artifact, filters.
 */

// --- EIP-8004 registration file (from agentURI) ---
export interface EIP8004Service {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
}

export interface EIP8004Registration {
  agentId: number;
  agentRegistry: string;
}

export interface EIP8004RegistrationFile {
  type: string;
  name: string;
  description?: string;
  image?: string;
  services: EIP8004Service[];
  x402Support?: boolean;
  active?: boolean;
  registrations: EIP8004Registration[];
  supportedTrust?: string[];
}

// --- Normalized Agent Card (internal) ---
export interface AgentCard {
  agentId: number;
  agentRegistry: string;
  name: string;
  description?: string;
  image?: string;
  operator?: string;
  version?: string;
  capabilities: string[];
  services: EIP8004Service[];
  pricing?: {
    mode: "fixed" | "hourly" | "per-task";
    min?: number;
    max?: number;
    currency?: string;
  };
  terms?: string;
  verification_supported: string[];
  payment_methods: string[];
  supportedTrust: string[];
  x402Support: boolean;
  active: boolean;
  raw?: EIP8004RegistrationFile;
}

// --- Trust summary (from Reputation + Validation) ---
export interface TrustSummary {
  validationCount: number;
  averageValidationResponse?: number;
  feedbackCount: number;
  summaryValue?: number;
  summaryValueDecimals?: number;
  tag1?: string;
  tag2?: string;
}

// --- Job Spec ---
export interface JobSpec {
  objective: string;
  acceptance_criteria?: string[];
  inputs?: Record<string, string>; // e.g. repo refs, prompts, attachment URIs
  constraints?: {
    time?: string;
    budget?: string;
    toolchain?: string[];
  };
  deliverables?: string[]; // files, report, PR link
  verification_plan?: string;
}

export interface AcceptedQuote {
  price?: string;
  timeline?: string;
  verification_mode?: string;
  payment_terms?: string;
}

export type JobStatus =
  | "draft"
  | "quoted"
  | "accepted"
  | "executing"
  | "verifying"
  | "settled"
  | "failed";

export interface Job {
  job_id: string;
  agent_id: number;
  spec: JobSpec;
  quote?: AcceptedQuote;
  status: JobStatus;
  output_refs?: string[];
  validation_artifact?: ValidationArtifact;
  created_at: string;
  updated_at: string;
}

// --- Validation Artifact ---
export interface ValidationArtifact {
  job_id: string;
  output_hash: string;
  verifier_id: string;
  verification_result: "pass" | "fail";
  metrics?: Record<string, number | string>;
  signatures?: string[];
  evidence_uris?: string[];
}

// --- Search/filter params ---
export interface SearchAgentsFilters {
  capability?: string;
  min_reputation?: number;
  min_validations?: number;
  supported_trust?: string[];
  limit?: number;
}

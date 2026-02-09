/**
 * Job Orchestrator: job lifecycle (draft → quoted → accepted → executing → verifying → settled | failed).
 * Storage: SQLite (path from JOB_DB_PATH; default :memory: for ephemeral).
 */

import Database from "better-sqlite3";
import type {
  Job,
  JobSpec,
  JobStatus,
  AcceptedQuote,
  ValidationArtifact,
} from "../types/schemas.js";
import { randomUUID } from "node:crypto";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const path = process.env.JOB_DB_PATH ?? ":memory:";
  db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      spec TEXT NOT NULL,
      quote TEXT,
      status TEXT NOT NULL,
      output_refs TEXT,
      validation_artifact TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

function serializeSpec(spec: JobSpec): string {
  return JSON.stringify(spec);
}
function deserializeSpec(s: string): JobSpec {
  return JSON.parse(s) as JobSpec;
}
function serializeQuote(q: AcceptedQuote | undefined): string | null {
  return q ? JSON.stringify(q) : null;
}
function deserializeQuote(s: string | null): AcceptedQuote | undefined {
  return s ? (JSON.parse(s) as AcceptedQuote) : undefined;
}
function serializeArtifact(a: ValidationArtifact | undefined): string | null {
  return a ? JSON.stringify(a) : null;
}
function deserializeArtifact(s: string | null): ValidationArtifact | undefined {
  return s ? (JSON.parse(s) as ValidationArtifact) : undefined;
}

export function createJob(
  agent_id: number,
  spec: JobSpec,
  quote?: AcceptedQuote,
  status: JobStatus = "accepted"
): Job {
  const job_id = randomUUID();
  const now = new Date().toISOString();
  const job: Job = {
    job_id,
    agent_id,
    spec,
    quote,
    status,
    created_at: now,
    updated_at: now,
  };
  const database = getDb();
  database
    .prepare(
      `INSERT INTO jobs (job_id, agent_id, spec, quote, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      job_id,
      agent_id,
      serializeSpec(spec),
      serializeQuote(quote),
      status,
      now,
      now
    );
  return job;
}

export function getJob(job_id: string): Job | null {
  const database = getDb();
  const row = database
    .prepare(
      `SELECT job_id, agent_id, spec, quote, status, output_refs, validation_artifact, created_at, updated_at FROM jobs WHERE job_id = ?`
    )
    .get(job_id) as {
    job_id: string;
    agent_id: number;
    spec: string;
    quote: string | null;
    status: string;
    output_refs: string | null;
    validation_artifact: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;
  if (!row) return null;
  const output_refs = row.output_refs
    ? (JSON.parse(row.output_refs) as string[])
    : undefined;
  return {
    job_id: row.job_id,
    agent_id: row.agent_id,
    spec: deserializeSpec(row.spec),
    quote: deserializeQuote(row.quote),
    status: row.status as JobStatus,
    output_refs,
    validation_artifact: deserializeArtifact(row.validation_artifact),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function updateJobStatus(job_id: string, status: JobStatus): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE jobs SET status = ?, updated_at = ? WHERE job_id = ?`)
    .run(status, now, job_id);
}

export function setOutputRefs(job_id: string, output_refs: string[]): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE jobs SET output_refs = ?, updated_at = ? WHERE job_id = ?`)
    .run(JSON.stringify(output_refs), now, job_id);
}

export function setValidationArtifact(
  job_id: string,
  validation_artifact: ValidationArtifact
): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE jobs SET validation_artifact = ?, updated_at = ? WHERE job_id = ?`
    )
    .run(serializeArtifact(validation_artifact), now, job_id);
}

export function listJobs(agent_id?: number, status?: JobStatus): Job[] {
  const database = getDb();
  let sql = `SELECT job_id, agent_id, spec, quote, status, output_refs, validation_artifact, created_at, updated_at FROM jobs WHERE 1=1`;
  const params: (string | number)[] = [];
  if (agent_id != null) {
    sql += ` AND agent_id = ?`;
    params.push(agent_id);
  }
  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY updated_at DESC`;
  const rows = database.prepare(sql).all(...params) as {
    job_id: string;
    agent_id: number;
    spec: string;
    quote: string | null;
    status: string;
    output_refs: string | null;
    validation_artifact: string | null;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((row) => ({
    job_id: row.job_id,
    agent_id: row.agent_id,
    spec: deserializeSpec(row.spec),
    quote: deserializeQuote(row.quote),
    status: row.status as JobStatus,
    output_refs: row.output_refs
      ? (JSON.parse(row.output_refs) as string[])
      : undefined,
    validation_artifact: deserializeArtifact(row.validation_artifact),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

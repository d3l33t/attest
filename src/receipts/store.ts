/**
 * Receipt store: SQLite-backed execution receipts for every invocation.
 * Schema: receipt_id, principal, agent_id, tool_name, tool_id, args_digest, started_at, ended_at, outcome, result_digest, error_message.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const path = process.env.RECEIPT_DB_PATH ?? "./data/receipts.sqlite";
  if (path !== ":memory:") {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      // ignore if dir exists or path is relative and cwd is wrong
    }
  }
  db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      receipt_id TEXT PRIMARY KEY,
      principal TEXT NOT NULL,
      agent_id INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      args_digest TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      outcome TEXT NOT NULL,
      result_digest TEXT,
      error_message TEXT
    )
  `);
  return db;
}

export type ReceiptOutcome = "ok" | "error";

export interface Receipt {
  receipt_id: string;
  principal: string;
  agent_id: number;
  tool_name: string;
  tool_id: string;
  args_digest: string | null;
  started_at: string;
  ended_at: string | null;
  outcome: ReceiptOutcome;
  result_digest: string | null;
  error_message: string | null;
}

export function createReceipt(
  principal: string,
  agent_id: number,
  tool_name: string,
  tool_id: string,
  args_digest: string | null
): Receipt {
  const receipt_id = randomUUID();
  const started_at = new Date().toISOString();
  const database = getDb();
  database
    .prepare(
      `INSERT INTO receipts (receipt_id, principal, agent_id, tool_name, tool_id, args_digest, started_at, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ok')`
    )
    .run(receipt_id, principal, agent_id, tool_name, tool_id, args_digest ?? null, started_at);
  return {
    receipt_id,
    principal,
    agent_id,
    tool_name,
    tool_id,
    args_digest,
    started_at,
    ended_at: null,
    outcome: "ok",
    result_digest: null,
    error_message: null,
  };
}

export function updateReceiptOutcome(
  receipt_id: string,
  outcome: ReceiptOutcome,
  result_digest: string | null,
  error_message: string | null
): void {
  const ended_at = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE receipts SET ended_at = ?, outcome = ?, result_digest = ?, error_message = ? WHERE receipt_id = ?`
    )
    .run(ended_at, outcome, result_digest ?? null, error_message ?? null, receipt_id);
}

export function getReceipt(receipt_id: string): Receipt | null {
  const row = getDb()
    .prepare(
      `SELECT receipt_id, principal, agent_id, tool_name, tool_id, args_digest, started_at, ended_at, outcome, result_digest, error_message FROM receipts WHERE receipt_id = ?`
    )
    .get(receipt_id) as {
    receipt_id: string;
    principal: string;
    agent_id: number;
    tool_name: string;
    tool_id: string;
    args_digest: string | null;
    started_at: string;
    ended_at: string | null;
    outcome: string;
    result_digest: string | null;
    error_message: string | null;
  } | undefined;
  if (!row) return null;
  return {
    ...row,
    outcome: row.outcome as ReceiptOutcome,
  };
}

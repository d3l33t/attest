/**
 * MCP tool: get_receipt — fetch execution receipt by id.
 */

import { getReceipt } from "../receipts/store.js";

export const name = "get_receipt";
export const description = "Fetch an execution receipt by receipt_id (returned from invoke).";

export interface GetReceiptArgs {
  receipt_id: string;
}

export function getReceiptTool(args: GetReceiptArgs) {
  const receipt = getReceipt(args.receipt_id);
  if (!receipt) return null;
  return receipt;
}

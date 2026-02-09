/**
 * CLI: run agent search (uses .env from project root).
 * Usage: npm run search-agents [-- capability=code-review] [-- limit=10]
 * Progress: DEBUG=1 npm run search-agents
 */

import "dotenv/config";
import { searchAgents } from "./tools/search_agents.js";

const limit = process.argv.find((a) => a.startsWith("limit="))?.split("=")[1];
const capability = process.argv.find((a) => a.startsWith("capability="))?.split("=").slice(1).join("=");

async function main() {
  const source = process.env.SUBGRAPH_URL ? "subgraph" : `RPC: ${process.env.RPC_URL ?? "default"}`;
  console.error("Searching agents (%s)...", source);
  const result = await searchAgents({
    limit: limit ? parseInt(limit, 10) : 20,
    capability: capability || undefined,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

# Contributing to Attest

Thanks for your interest in contributing to Attest. This document gives a short overview of how to get started.

## Development setup

```bash
git clone https://github.com/<owner>/attest.git   # Replace <owner> with the org or username
cd attest
npm install
cp .env.example .env   # Edit .env with your RPC and optional keys
npm run build
npm start              # Run MCP server (stdio)
```

For Cursor: after `npm run build`, the server is available via `.cursor/mcp.json` under the name `attest`.

## Code and PRs

- **Branch:** Create a feature branch from `main` (e.g. `feature/your-feature` or `fix/issue-123`).
- **Scope:** Keep PRs focused. For larger work, open an issue first to align on approach.
- **Tests:** Add or update tests when changing behavior. If a test script exists, run it before submitting.
- **Style:** Follow the existing TypeScript style; the project uses `tsc` with strict options.

## Areas you can help

- **ERC-8004 integration:** Subgraph queries, registry adapters, Agent Card resolution.
- **Policy:** Filters, risk classes, principal-scoped policy, rate limiting.
- **MCP tools:** New tools or improvements to `search_agents`, `list_tools`, `invoke`, receipts.
- **Docs:** README, CONTRIBUTING, design docs in `docs/`, and code comments.

## Reporting issues

Open a GitHub issue with:

- A clear title and description
- Steps to reproduce (for bugs)
- Your environment (Node version, OS, relevant env like `SUBGRAPH_URL` or chain)
- Logs or error messages (redact secrets)

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) that covers Attest.

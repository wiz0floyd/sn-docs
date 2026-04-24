# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Purpose

A Node.js CLI tool and MCP server for querying `docs.servicenow.com` via the ServiceNow Fluid Docs API. Enables Claude (and other AI tools) to retrieve official ServiceNow documentation at runtime.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/
npm run dev:cli      # Run CLI via tsx (no build needed)
npm run dev:mcp      # Run MCP server via tsx (no build needed)
npm test             # Run unit tests (mocked fetch, no network)
npm run test:integration  # Run live API smoke tests (requires network)
npm run lint         # Type-check without emitting
```

### Run a single test file

```bash
npx vitest run tests/docs-client.test.ts
```

### Test the CLI after building

```bash
npm run build
node bin/sn-docs.js search "incident" --limit 5
node bin/sn-docs.js get <contentUrl>
node bin/sn-docs.js suggest "incid"
node bin/sn-docs.js locales
```

### Test the MCP server

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node bin/sn-docs-mcp.js
```

## Architecture

Two entry points sharing a core query layer:

```
src/
  cli.js          # Commander-based CLI — parses args, calls core, prints output
  mcp-server.js   # MCP server — exposes tools over stdio for Claude to call
  docs-client.js  # Fluid Docs API client — all HTTP calls live here
  utils/          # Shared formatters, pagination helpers, etc.
```

**Data flow:**
1. CLI or MCP tool handler receives a query
2. `docs-client.js` calls the Fluid Docs API (`docs.servicenow.com/api/...`)
3. Response is normalized and returned; CLI renders to stdout, MCP returns JSON tool result

## MCP Server

The MCP server uses `@anthropic-ai/sdk` or `@modelcontextprotocol/sdk` over stdio transport. Tools should map 1:1 to Fluid Docs API operations (search, get article, list products, etc.).

Register the server in Claude Desktop / Claude Code via `mcpServers` in settings — path to `mcp-server.js` as the command.

## Fluid Docs API

Base URL pattern: `https://docs.servicenow.com/api/...`

- Requires no auth for public docs; check for session/token requirements on internal endpoints.
- Rate-limit defensively — add retry with exponential backoff in `docs-client.js`.
- API shape should be reverse-engineered or sourced from network inspection of the docs site.

## Key Dependencies (expected)

- `commander` — CLI argument parsing
- `@modelcontextprotocol/sdk` — MCP server scaffolding
- `node-fetch` / native `fetch` — HTTP client
- `vitest` or `jest` — testing

## Registering with Claude Code / Claude Desktop

Add to `~/.claude/settings.json` (Claude Code) or Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "sn-docs": {
      "command": "node",
      "args": ["/absolute/path/to/bin/sn-docs-mcp.js"]
    }
  }
}
```

Build first (`npm run build`). The server requires no environment variables.

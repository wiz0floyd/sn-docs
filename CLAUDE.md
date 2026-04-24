# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Purpose

A Node.js CLI tool and MCP server for querying `docs.servicenow.com` via the ServiceNow Fluid Docs API. Enables Claude (and other AI tools) to retrieve official ServiceNow documentation at runtime.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (if TS is used)
npm start            # Run CLI in production mode
npm run dev          # Run CLI with hot-reload (ts-node / nodemon)
npm test             # Run all tests
npm test -- <file>   # Run a single test file
npm run lint         # Lint source
```

> Update this section once `package.json` scripts are defined.

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

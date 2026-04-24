# Cloudflare Worker MCP Server — Design

**Date:** 2026-04-24  
**Status:** Approved

## Goal

Deploy the sn-docs MCP server as a Cloudflare Worker (HTTP-accessible) alongside the existing stdio server, without modifying the stdio path.

## Approach

Streamable HTTP transport (`StreamableHTTPServerTransport`) in stateless mode. Each POST creates a fresh Server + transport, handles the request, and returns the response. Fits CF Workers' stateless execution model exactly.

## File Layout

```
src/
  mcp-server.ts       — existing stdio server, untouched
  mcp-worker.ts       — new CF Worker entry point
  docs-client.ts      — shared, unchanged
  formatter.ts        — used only by stdio build (not imported by worker)
  types.ts            — shared
wrangler.toml         — new, CF Worker config
```

## Request Handling

- All requests enter via the standard CF Worker `fetch(request, env, ctx)` export.
- Only `POST /mcp` is handled; all other paths return 404.
- Rate limiting is checked first using the `RATE_LIMITER` binding (CF native RateLimit API, keyed by client IP). Exceeded requests return 429 before any MCP logic runs.
- A fresh `Server` and `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` are created per request (stateless mode).
- The same 4 tools are registered: `search_docs`, `get_article`, `suggest`, `list_locales`.
- `get_article` returns raw HTML (no `toMarkdown()` call) — markdown conversion is handled by the skill wrapper.

```
POST /mcp
  → RATE_LIMITER.limit({ key: clientIP }) → 429 if exceeded
  → new Server + StreamableHTTPServerTransport (stateless)
  → register tools
  → transport.handleRequest(request) → Response
```

## Build & Config

### package.json — new script

```json
"build:worker": "esbuild src/mcp-worker.ts --bundle --platform=browser --format=esm --target=esnext --outfile=dist/mcp-worker.js"
```

### wrangler.toml — new file

```toml
name = "sn-docs-mcp"
main = "dist/mcp-worker.js"
compatibility_date = "2024-11-01"

[[unsafe.bindings]]
name = "RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 60, period = 60 }
```

### MCP SDK version

`StreamableHTTPServerTransport` requires `@modelcontextprotocol/sdk` ≥1.6.0. Bump `package.json` to `^1.6.0` if the installed version is older.

## What is NOT changing

- `src/mcp-server.ts` — stdio server, untouched
- `src/docs-client.ts` — already CF-compatible (native fetch, no Node APIs)
- `src/formatter.ts` — not imported by the worker build
- All existing CLI and stdio MCP behavior

## Out of Scope

- Authentication (endpoint is open, rate-limited only)
- Session persistence / stateful MCP sessions
- Markdown conversion in the Worker (delegated to skill wrapper)

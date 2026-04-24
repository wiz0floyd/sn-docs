# Cloudflare Worker MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `src/mcp-worker.ts` as a Cloudflare Worker entry point for the MCP server, using `WebStandardStreamableHTTPServerTransport` in stateless mode, alongside the unchanged stdio server.

**Architecture:** New CF Worker entry point exports a `fetch` handler. Each POST to `/mcp` creates a fresh `Server` + `WebStandardStreamableHTTPServerTransport` (stateless — no session management), checks rate limiting via the `RATE_LIMITER` binding, then delegates to the transport. `get_article` returns raw HTML instead of calling `toMarkdown()`. The `docs-client.ts` shared module is unchanged.

**Tech Stack:** `@modelcontextprotocol/sdk` v1.29.0 (`WebStandardStreamableHTTPServerTransport`), Cloudflare Workers RateLimit binding, esbuild (browser platform, ESM output), Vitest.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/mcp-worker.ts` | Create | CF Worker entry point — fetch handler, rate limiting, MCP server |
| `wrangler.toml` | Create | CF Worker config — name, entry, rate limiter binding |
| `package.json` | Modify | Add `build:worker` script |
| `tests/mcp-worker.test.ts` | Create | Unit tests for routing and rate limiting |

---

### Task 1: Write failing tests for the worker

**Files:**
- Create: `tests/mcp-worker.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// tests/mcp-worker.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/docs-client.js', () => ({
  search: vi.fn(),
  suggest: vi.fn(),
  getLocales: vi.fn(),
  getContent: vi.fn(),
}));

import worker from '../src/mcp-worker.js';

function makeEnv(success = true) {
  return {
    RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success }),
    },
  };
}

describe('worker routing', () => {
  it('returns 404 for unknown paths', async () => {
    const req = new Request('https://example.com/foo', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limit exceeded', async () => {
    const env = makeEnv(false);
    const req = new Request('https://example.com/mcp', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(429);
  });

  it('keys rate limit by cf-connecting-ip', async () => {
    const env = makeEnv(false);
    const req = new Request('https://example.com/mcp', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '5.6.7.8' },
    });
    await worker.fetch(req, env);
    expect(env.RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '5.6.7.8' });
  });

  it('falls back to "unknown" when no cf-connecting-ip header', async () => {
    const env = makeEnv(false);
    const req = new Request('https://example.com/mcp', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    await worker.fetch(req, env);
    expect(env.RATE_LIMITER.limit).toHaveBeenCalledWith({ key: 'unknown' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: 4 failures — `Cannot find module '../src/mcp-worker.js'`

---

### Task 2: Implement `src/mcp-worker.ts`

**Files:**
- Create: `src/mcp-worker.ts`

- [ ] **Step 1: Create the worker entry point**

```typescript
// src/mcp-worker.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { search, suggest, getLocales, getContent } from './docs-client.js';
import { DocsApiError } from './types.js';

interface Env {
  RATE_LIMITER: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

function buildServer(): Server {
  const server = new Server(
    { name: 'sn-docs', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_docs',
        description: 'Search ServiceNow documentation. Returns titles, breadcrumbs, excerpts, and URLs.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Search terms' },
            lang: { type: 'string', description: 'Language code, e.g. en-US (default), fr-FR, de-DE, ja-JP, ko-KR, pt-BR' },
            limit: { type: 'number', description: 'Results per page (default 10, max 50)' },
            page: { type: 'number', description: 'Page number, 1-based (default 1)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_article',
        description: 'Fetch a ServiceNow documentation article as HTML. Pass contentUrl from search_docs results.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            url: { type: 'string', description: 'contentUrl or readerUrl from search_docs results' },
          },
          required: ['url'],
        },
      },
      {
        name: 'suggest',
        description: 'Get autocomplete suggestions for a partial search query.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string', description: 'Partial query string' },
          },
          required: ['input'],
        },
      },
      {
        name: 'list_locales',
        description: 'List available documentation languages with article counts.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'search_docs': {
          const { query, lang, limit, page } = args as {
            query: string; lang?: string; limit?: number; page?: number;
          };
          const maxResults = Math.min(limit ?? 10, 50);
          const from = ((page ?? 1) - 1) * maxResults;
          const { items, paging } = await search({ query, lang, maxResults, from });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ items, paging }, null, 2) }],
          };
        }

        case 'get_article': {
          const { url } = args as { url: string };
          const html = await getContent(url);
          return {
            content: [{ type: 'text' as const, text: html }],
          };
        }

        case 'suggest': {
          const { input } = args as { input: string };
          const suggestions = await suggest(input);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(suggestions.slice(0, 10), null, 2) }],
          };
        }

        case 'list_locales': {
          const locales = await getLocales();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(locales, null, 2) }],
          };
        }

        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      const msg =
        err instanceof DocsApiError
          ? `API Error ${err.statusCode}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      return { content: [{ type: 'text' as const, text: msg }], isError: true };
    }
  });

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname !== '/mcp') {
      return new Response('Not Found', { status: 404 });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response('Too Many Requests', { status: 429 });
    }

    const server = buildServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: 4 tests pass, all others still pass.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-worker.ts tests/mcp-worker.test.ts
git commit -m "feat: add Cloudflare Worker MCP entry point"
```

---

### Task 3: Add `wrangler.toml`

**Files:**
- Create: `wrangler.toml`

- [ ] **Step 1: Create the config**

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

The `namespace_id` value `"1001"` is a local-dev placeholder. Before deploying, replace it with your actual Cloudflare rate limit namespace ID from the dashboard (Workers → Rate Limiting).

- [ ] **Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "chore: add wrangler.toml for Cloudflare Worker deployment"
```

---

### Task 4: Add `build:worker` script and verify the bundle

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

In `package.json`, add to the `"scripts"` block:

```json
"build:worker": "esbuild src/mcp-worker.ts --bundle --platform=browser --format=esm --target=esnext --outfile=dist/mcp-worker.js"
```

The full `"scripts"` block becomes:

```json
"scripts": {
  "build": "tsc",
  "build:worker": "esbuild src/mcp-worker.ts --bundle --platform=browser --format=esm --target=esnext --outfile=dist/mcp-worker.js",
  "dev:cli": "tsx src/cli.ts",
  "dev:mcp": "tsx src/mcp-server.ts",
  "test": "vitest run",
  "test:integration": "INTEGRATION=true vitest run tests/integration.test.ts",
  "lint": "tsc --noEmit",
  "build:release": "node -e \"require('fs').mkdirSync('release',{recursive:true})\" && npx esbuild src/cli.ts --bundle --platform=node --target=node20 --format=cjs --outfile=release/sn-docs-cli.cjs --banner:js=\"#!/usr/bin/env node\" && npx esbuild src/mcp-server.ts --bundle --platform=node --target=node20 --format=cjs --outfile=release/sn-docs-mcp.cjs --banner:js=\"#!/usr/bin/env node\""
}
```

- [ ] **Step 2: Run the build and verify output**

```bash
npm run build:worker
```

Expected: `dist/mcp-worker.js` created, no errors. Size should be under 500 KB.

```bash
ls -lh dist/mcp-worker.js
```

Expected: file exists with non-zero size.

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add build:worker script for Cloudflare Worker bundle"
```

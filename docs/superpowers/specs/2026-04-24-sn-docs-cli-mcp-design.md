# Design: ServiceNow Docs CLI + MCP Server

**Date:** 2026-04-24  
**Status:** Approved

## Overview

A Node.js project exposing two entry points — a CLI (`sn-docs`) and an MCP server (`sn-docs-mcp`) — that both query the ServiceNow Fluid Docs API at `https://www.servicenow.com/docs/api/khub/`. No authentication required. Article HTML is converted to Markdown for AI-friendly output.

## API Surface (Discovered)

Base: `https://www.servicenow.com/docs/api/khub/`

| Endpoint | Method | Body / Params | Purpose |
|---|---|---|---|
| `/clustered-search` | POST | `{query, lang?, maxResults?, from?}` | Full-text search |
| `/suggest` | POST | `{input}` | Autocomplete suggestions |
| `/locales` | GET | — | Available languages |
| `/maps/{mapId}/topics/{topicId}/content` | GET | — | Article HTML body |

Search response shape:
```
{
  facets: [],
  results: [{ metadataVariableAxis, entries: [{ type, missingTerms, topic }] }],
  announcements: [],
  paging: { currentPage, isLastPage, totalResultsCount, totalClustersCount }
}
```

Topic fields: `mapId`, `contentId`, `tocId`, `title`, `breadcrumb[]`, `htmlExcerpt`, `metadata[]`, `readerUrl`, `contentUrl`, `topicUrl`, `lastEditionDate`.

## Stack

- **TypeScript + ESM** — MCP SDK is TS-native; API response has ~40 metadata keys per topic where types prevent mistakes
- **Node 20+** — native `fetch`, no polyfill needed
- **@modelcontextprotocol/sdk** — MCP stdio server
- **commander** — CLI argument parsing
- **turndown** — HTML → Markdown conversion
- **vitest** — unit + integration tests

## File Structure

```
src/
  types.ts            # API response interfaces (SearchResponse, Topic, Locale, etc.)
  docs-client.ts      # All HTTP calls — search(), suggest(), getLocales(), getContent()
  formatter.ts        # stripHtml(): HTML → clean Markdown via turndown
  cli.ts              # Commander CLI (entry: bin/sn-docs)
  mcp-server.ts       # MCP stdio server (entry: bin/sn-docs-mcp)
bin/
  sn-docs             # Shebang → dist/cli.js
  sn-docs-mcp         # Shebang → dist/mcp-server.js
dist/                 # tsc output (gitignored)
tests/
  docs-client.test.ts # Unit tests with fetch mock
  formatter.test.ts   # HTML → Markdown conversion tests
  integration.test.ts # Live API smoke tests (skipped in CI via env flag)
```

## CLI Design

```
sn-docs search <query>   [--lang en-US] [--limit 10] [--page 1] [--json]
sn-docs get <url>        [--lang en-US]
sn-docs suggest <input>
sn-docs locales
```

- `search`: Default text output — title, breadcrumb path, excerpt snippet, readerUrl, last updated. `--json` returns raw API JSON.
- `get`: Accepts `readerUrl` (`https://www.servicenow.com/docs/r/...`) or `contentUrl` (`https://www.servicenow.com/docs/api/khub/maps/.../topics/.../content`). Outputs Markdown to stdout.
- `suggest`: One suggestion per line.
- `locales`: Table of lang code, label, article count.

## MCP Tools (4)

### `search_docs`
- **Input:** `query: string`, `lang?: string (default "en-US")`, `limit?: number (default 10, max 50)`, `page?: number (default 1)`
- **Output:** Array of `{ title, breadcrumb, excerpt, readerUrl, lastUpdated, contentUrl }`

### `get_article`
- **Input:** `url: string` — accepts `readerUrl` or `contentUrl`
- **Output:** Markdown string of article body. `formatter.ts` strips nav, breadcrumb UI, version badges, and converts code blocks, headings, lists faithfully.

### `suggest`
- **Input:** `input: string`
- **Output:** Array of suggestion strings (max 10)

### `list_locales`
- **Input:** none
- **Output:** Array of `{ lang, label, count }`

## URL Resolution

`get_article` accepts two URL formats:
1. `readerUrl` (`/docs/r/{prettyUrl}`) — must be resolved to `contentUrl` by performing a search for the prettyUrl path and extracting `contentUrl`, OR by fetching the reader page and extracting the content URL from the page source.
2. `contentUrl` (`/docs/api/khub/maps/{mapId}/topics/{topicId}/content`) — used directly.

Preferred approach: accept `contentUrl` directly (returned by `search_docs`). For `readerUrl`, parse the path and attempt a targeted search with the topic name to locate the matching `contentUrl`. Fall back to `readerUrl` fetch + DOM parse if needed.

## Error Handling

- `docs-client.ts` throws `DocsApiError` (extends `Error`) with `statusCode` and `message`.
- CLI: catches at top level, writes to stderr, exits 1.
- MCP server: catches per-tool, returns MCP `isError: true` result — never crashes the server process.
- Retry: 1 automatic retry with 500ms delay on 5xx responses.

## Formatter Rules (HTML → Markdown)

- Strip: `.zDocsTopicPageDetails` (version/date badges), nav breadcrumb UI, `<img>` tags (icons only)
- Preserve: `<h1>`–`<h6>`, `<pre><code>`, `<ul>/<ol>/<li>`, `<table>`, `<strong>/<em>`, `<a href>`
- Code blocks: detect `<pre>` with DITA `outputclass` attribute for language hint

## Testing

- Unit tests mock `globalThis.fetch` via `vi.stubGlobal`.
- Formatter tests use fixture HTML strings.
- Integration tests (`INTEGRATION=true vitest`) hit live API, assert shape not specific content.
- CI runs unit tests only.

## Configuration

No config file. All options via CLI flags or MCP tool args. `lang` defaults to `en-US` everywhere.

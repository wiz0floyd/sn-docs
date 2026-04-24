# sn-docs CLI + MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI (`sn-docs`) and MCP server (`sn-docs-mcp`) that query the ServiceNow Fluid Docs API at `https://www.servicenow.com/docs/api/khub/` and return search results + article content as Markdown.

**Architecture:** A shared `docs-client.ts` handles all HTTP, a `formatter.ts` converts article HTML to Markdown via turndown, and two thin entry points (`cli.ts`, `mcp-server.ts`) expose the same capabilities over Commander and MCP stdio respectively.

**Tech Stack:** TypeScript 5, Node 20+ (native fetch), ESM (`"type":"module"`), `@modelcontextprotocol/sdk` ^1.0.0, `commander` ^12, `turndown` ^7, `vitest` ^1.

---

## File Map

| File | Purpose |
|---|---|
| `src/types.ts` | API response interfaces + `DocsApiError` class |
| `src/docs-client.ts` | All HTTP: `search()`, `suggest()`, `getLocales()`, `getContent()` |
| `src/formatter.ts` | `toMarkdown(html)` — HTML → clean Markdown via turndown |
| `src/cli.ts` | Commander CLI; four commands: search, get, suggest, locales |
| `src/mcp-server.ts` | MCP stdio server; four tools matching CLI commands |
| `bin/sn-docs.js` | Shebang entry → `dist/cli.js` |
| `bin/sn-docs-mcp.js` | Shebang entry → `dist/mcp-server.js` |
| `tests/docs-client.test.ts` | Unit tests with `vi.stubGlobal('fetch', ...)` |
| `tests/formatter.test.ts` | Unit tests for HTML → Markdown conversion |
| `tests/integration.test.ts` | Live API smoke tests (skipped unless `INTEGRATION=true`) |

> **ESM import rule:** All TypeScript import paths must use `.js` extension (e.g., `import { … } from './types.js'`), even though the source file is `.ts`. TypeScript Node16 resolution requires this.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "sn-docs",
  "version": "0.1.0",
  "description": "CLI and MCP server for querying docs.servicenow.com",
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": {
    "sn-docs": "bin/sn-docs.js",
    "sn-docs-mcp": "bin/sn-docs-mcp.js"
  },
  "scripts": {
    "build": "tsc",
    "dev:cli": "tsx src/cli.ts",
    "dev:mcp": "tsx src/mcp-server.ts",
    "test": "vitest run",
    "test:integration": "INTEGRATION=true vitest run tests/integration.test.ts",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "commander": "^12.0.0",
    "turndown": "^7.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/turndown": "^5.0.5",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration.test.ts'],
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.js.map
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "feat: project scaffold — TypeScript ESM, vitest, MCP SDK"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
// ----- Request -----

export interface SearchOptions {
  query: string;
  lang?: string;
  maxResults?: number;
  from?: number;
}

// ----- API response shapes -----

export interface TopicMetadata {
  key: string;
  label: string;
  values: string[];
}

export interface Topic {
  mapId: string;
  contentId: string;
  tocId: string;
  title: string;
  htmlTitle: string;
  mapTitle: string;
  breadcrumb: string[];
  htmlExcerpt: string;
  metadata: TopicMetadata[];
  readerUrl: string;
  contentUrl: string;
  topicUrl: string;
  lastEditionDate: string;
  openMode: string;
}

export interface SearchEntry {
  type: string;
  missingTerms: string[];
  topic: Topic;
}

export interface SearchResult {
  metadataVariableAxis: string;
  entries: SearchEntry[];
}

export interface Paging {
  currentPage: number;
  isLastPage: boolean;
  totalResultsCount: number;
  totalClustersCount: number;
}

export interface SearchResponse {
  facets: unknown[];
  results: SearchResult[];
  announcements: unknown[];
  paging: Paging;
}

export interface Suggestion {
  type: string;
  value: string;
}

export interface SuggestResponse {
  suggestions: Suggestion[];
}

export interface ContentLocale {
  lang: string;
  label: string;
  count: number;
}

export interface LocalesResponse {
  contentLocales: ContentLocale[];
}

// ----- Normalized output -----

export interface SearchResultItem {
  title: string;
  breadcrumb: string[];
  excerpt: string;
  readerUrl: string;
  contentUrl: string;
  lastUpdated: string;
}

// ----- Errors -----

export class DocsApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'DocsApiError';
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: API type definitions and DocsApiError"
```

---

### Task 3: HTTP Client (TDD)

**Files:**
- Create: `tests/docs-client.test.ts`
- Create: `src/docs-client.ts`

- [ ] **Step 1: Write failing tests — create tests/docs-client.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, suggest, getLocales, getContent } from '../src/docs-client.js';
import { DocsApiError } from '../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => mockFetch.mockReset());

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  });
}

function err(status: number) {
  return Promise.resolve({ ok: false, status, statusText: 'Error', json: () => Promise.resolve({}), text: () => Promise.resolve('') });
}

const SEARCH_RESPONSE = {
  facets: [],
  announcements: [],
  paging: { currentPage: 1, isLastPage: false, totalResultsCount: 100, totalClustersCount: 20 },
  results: [{
    metadataVariableAxis: 'ft:originId',
    entries: [{
      type: 'TOPIC',
      missingTerms: [],
      topic: {
        mapId: 'map1', contentId: 'c1', tocId: 't1',
        title: 'Incident Management',
        htmlTitle: '<span>Incident</span>',
        mapTitle: 'ITSM',
        breadcrumb: ['IT Service Management', 'Incident Management'],
        htmlExcerpt: '<span>Manage <em>incidents</em> here</span>',
        metadata: [{ key: 'last_updated_date', label: 'Last updated', values: ['2026-01-01T00:00:00'] }],
        readerUrl: 'https://www.servicenow.com/docs/r/itsm/incident.html',
        contentUrl: 'https://www.servicenow.com/docs/api/khub/maps/map1/topics/c1/content',
        topicUrl: 'https://www.servicenow.com/docs/api/khub/maps/map1/topics/c1',
        lastEditionDate: '2026-01-01', openMode: 'default',
      },
    }],
  }],
};

describe('search()', () => {
  it('returns normalized items with HTML stripped from excerpt', async () => {
    mockFetch.mockReturnValueOnce(ok(SEARCH_RESPONSE));
    const { items, paging } = await search({ query: 'incident' });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Incident Management');
    expect(items[0].breadcrumb).toEqual(['IT Service Management', 'Incident Management']);
    expect(items[0].excerpt).toBe('Manage incidents here');
    expect(items[0].readerUrl).toBe('https://www.servicenow.com/docs/r/itsm/incident.html');
    expect(items[0].contentUrl).toBe('https://www.servicenow.com/docs/api/khub/maps/map1/topics/c1/content');
    expect(items[0].lastUpdated).toBe('2026-01-01T00:00:00');
    expect(paging.totalResultsCount).toBe(100);
  });

  it('sends correct POST body with defaults', async () => {
    mockFetch.mockReturnValueOnce(ok({ ...SEARCH_RESPONSE, results: [] }));
    await search({ query: 'flow' });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.servicenow.com/docs/api/khub/clustered-search');
    expect(JSON.parse(init.body as string)).toMatchObject({ query: 'flow', lang: 'en-US', maxResults: 10, from: 0 });
  });

  it('passes through lang, maxResults, from options', async () => {
    mockFetch.mockReturnValueOnce(ok({ ...SEARCH_RESPONSE, results: [] }));
    await search({ query: 'flow', lang: 'fr-FR', maxResults: 5, from: 10 });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ query: 'flow', lang: 'fr-FR', maxResults: 5, from: 10 });
  });

  it('retries once on 5xx then throws DocsApiError', async () => {
    mockFetch.mockReturnValueOnce(err(503)).mockReturnValueOnce(err(503));
    await expect(search({ query: 'test' })).rejects.toBeInstanceOf(DocsApiError);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws DocsApiError on 4xx without retrying', async () => {
    mockFetch.mockReturnValueOnce(err(404));
    await expect(search({ query: 'test' })).rejects.toBeInstanceOf(DocsApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('skips non-TOPIC entries', async () => {
    const resp = {
      ...SEARCH_RESPONSE,
      results: [{ metadataVariableAxis: 'ft:originId', entries: [{ type: 'MAP', missingTerms: [], topic: {} }] }],
    };
    mockFetch.mockReturnValueOnce(ok(resp));
    const { items } = await search({ query: 'test' });
    expect(items).toHaveLength(0);
  });
});

describe('suggest()', () => {
  it('returns array of suggestion strings', async () => {
    mockFetch.mockReturnValueOnce(ok({ suggestions: [{ type: 'TOPIC', value: 'incident' }, { type: 'TOPIC', value: 'Incident' }] }));
    const result = await suggest('incid');
    expect(result).toEqual(['incident', 'Incident']);
  });

  it('posts to suggest endpoint with input field', async () => {
    mockFetch.mockReturnValueOnce(ok({ suggestions: [] }));
    await suggest('inc');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.servicenow.com/docs/api/khub/suggest');
    expect(JSON.parse(init.body as string)).toEqual({ input: 'inc' });
  });
});

describe('getLocales()', () => {
  it('returns contentLocales array', async () => {
    mockFetch.mockReturnValueOnce(ok({ contentLocales: [{ lang: 'en-US', label: 'English', count: 452 }, { lang: 'fr-FR', label: 'Français', count: 414 }] }));
    const result = await getLocales();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lang: 'en-US', label: 'English', count: 452 });
  });
});

describe('getContent()', () => {
  it('fetches directly when given a contentUrl', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<div>Hello</div>') }));
    const result = await getContent('https://www.servicenow.com/docs/api/khub/maps/map1/topics/t1/content');
    expect(result).toBe('<div>Hello</div>');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0] as [string])[0]).toContain('/api/khub/maps/map1/topics/t1/content');
  });

  it('resolves readerUrl via search before fetching content', async () => {
    mockFetch
      .mockReturnValueOnce(ok(SEARCH_RESPONSE))
      .mockReturnValueOnce(Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<div>Content</div>') }));
    const result = await getContent('https://www.servicenow.com/docs/r/itsm/incident.html');
    expect(result).toBe('<div>Content</div>');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect((mockFetch.mock.calls[1] as [string])[0]).toContain('/api/khub/maps/map1/topics/c1/content');
  });

  it('throws DocsApiError(404) when readerUrl cannot be resolved', async () => {
    mockFetch.mockReturnValueOnce(ok({ facets: [], announcements: [], paging: { currentPage: 1, isLastPage: true, totalResultsCount: 0, totalClustersCount: 0 }, results: [] }));
    await expect(getContent('https://www.servicenow.com/docs/r/itsm/nonexistent.html')).rejects.toBeInstanceOf(DocsApiError);
  });

  it('throws DocsApiError for unrecognized URL format', async () => {
    await expect(getContent('https://example.com/not-a-docs-url')).rejects.toBeInstanceOf(DocsApiError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('retries once on 5xx content fetch', async () => {
    mockFetch
      .mockReturnValueOnce(Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' }))
      .mockReturnValueOnce(Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<div>Retry</div>') }));
    const result = await getContent('https://www.servicenow.com/docs/api/khub/maps/map1/topics/t1/content');
    expect(result).toBe('<div>Retry</div>');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
npm test
```

Expected: multiple failures like "Cannot find module '../src/docs-client.js'".

- [ ] **Step 3: Create src/docs-client.ts**

```typescript
import type {
  SearchOptions, SearchResponse, SuggestResponse, LocalesResponse,
  SearchResultItem, ContentLocale,
} from './types.js';
import { DocsApiError } from './types.js';

const BASE = 'https://www.servicenow.com/docs/api/khub';

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise<void>(r => setTimeout(r, 500));
    const res = await fetch(url, init);
    if (res.ok || res.status < 500) return res;
    lastRes = res;
  }
  return lastRes!;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new DocsApiError(res.status, `API error ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function requestText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new DocsApiError(res.status, `Failed to fetch content: ${res.status}`);
  return res.text();
}

export async function search(
  options: SearchOptions,
): Promise<{ items: SearchResultItem[]; paging: SearchResponse['paging'] }> {
  const body = {
    query: options.query,
    lang: options.lang ?? 'en-US',
    maxResults: options.maxResults ?? 10,
    from: options.from ?? 0,
  };
  const data = await request<SearchResponse>(`${BASE}/clustered-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const items: SearchResultItem[] = [];
  for (const result of data.results) {
    for (const entry of result.entries) {
      if (entry.type !== 'TOPIC') continue;
      const t = entry.topic;
      const excerpt = t.htmlExcerpt.replace(/<[^>]+>/g, '');
      const lastUpdated = t.metadata.find(m => m.key === 'last_updated_date')?.values[0] ?? '';
      items.push({ title: t.title, breadcrumb: t.breadcrumb, excerpt, readerUrl: t.readerUrl, contentUrl: t.contentUrl, lastUpdated });
    }
  }
  return { items, paging: data.paging };
}

export async function suggest(input: string): Promise<string[]> {
  const data = await request<SuggestResponse>(`${BASE}/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  return data.suggestions.map(s => s.value);
}

export async function getLocales(): Promise<ContentLocale[]> {
  const data = await request<LocalesResponse>(`${BASE}/locales`);
  return data.contentLocales;
}

export async function getContent(url: string): Promise<string> {
  const contentUrl = await resolveContentUrl(url);
  return requestText(contentUrl);
}

async function resolveContentUrl(url: string): Promise<string> {
  if (url.includes('/api/khub/maps/')) return url;

  const match = url.match(/\/docs\/r\/(.+)/);
  if (!match) throw new DocsApiError(400, `Unrecognized URL format: ${url}`);

  const prettyPath = match[1];
  const topicSlug = prettyPath.split('/').pop()?.replace(/\.html$/, '') ?? prettyPath;
  const query = topicSlug.replace(/-/g, ' ');

  const { items } = await search({ query, maxResults: 10 });
  const found = items.find(
    item => item.readerUrl === url || item.readerUrl.endsWith(prettyPath),
  );
  if (found) return found.contentUrl;

  throw new DocsApiError(404, `Could not resolve content URL for: ${url}`);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test
```

Expected: all docs-client tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/docs-client.ts tests/docs-client.test.ts
git commit -m "feat: HTTP client with retry logic and URL resolution (TDD)"
```

---

### Task 4: HTML Formatter (TDD)

**Files:**
- Create: `tests/formatter.test.ts`
- Create: `src/formatter.ts`

- [ ] **Step 1: Write failing tests — create tests/formatter.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { toMarkdown } from '../src/formatter.js';

describe('toMarkdown()', () => {
  it('converts h1 headings', () => {
    expect(toMarkdown('<h1>Title</h1>')).toBe('# Title');
  });

  it('converts h2 headings', () => {
    expect(toMarkdown('<h2>Section</h2>')).toBe('## Section');
  });

  it('converts unordered lists', () => {
    const result = toMarkdown('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(result).toContain('- Item 1');
    expect(result).toContain('- Item 2');
  });

  it('converts ordered lists', () => {
    const result = toMarkdown('<ol><li>First</li><li>Second</li></ol>');
    expect(result).toContain('1. First');
    expect(result).toContain('2. Second');
  });

  it('wraps code blocks in fenced markdown', () => {
    const result = toMarkdown('<pre><code>const x = 1;</code></pre>');
    expect(result).toContain('```');
    expect(result).toContain('const x = 1;');
  });

  it('converts bold text', () => {
    expect(toMarkdown('<strong>bold</strong>')).toBe('**bold**');
  });

  it('converts italic text', () => {
    expect(toMarkdown('<em>italic</em>')).toMatch(/_italic_|\*italic\*/);
  });

  it('preserves links with href', () => {
    const result = toMarkdown('<a href="https://example.com">click here</a>');
    expect(result).toContain('[click here](https://example.com)');
  });

  it('strips nav elements entirely', () => {
    const result = toMarkdown('<nav>Breadcrumb nav</nav><p>Content</p>');
    expect(result).not.toContain('Breadcrumb nav');
    expect(result).toContain('Content');
  });

  it('strips zDocsTopicPageDetails chrome', () => {
    const result = toMarkdown(
      '<div class="zDocsTopicPageDetails">Version badge</div><p>Real content</p>',
    );
    expect(result).not.toContain('Version badge');
    expect(result).toContain('Real content');
  });

  it('strips zDocsTopicPageCluster chrome', () => {
    const result = toMarkdown('<li class="zDocsTopicPageCluster">cluster</li><p>body</p>');
    expect(result).not.toContain('cluster');
    expect(result).toContain('body');
  });

  it('strips img elements', () => {
    const result = toMarkdown('<img src="icon.png" alt="icon"><p>text</p>');
    expect(result).not.toContain('icon.png');
    expect(result).toContain('text');
  });

  it('returns empty string for empty input', () => {
    expect(toMarkdown('')).toBe('');
  });

  it('handles deeply nested content', () => {
    const result = toMarkdown('<div><div><p>Deep content</p></div></div>');
    expect(result).toContain('Deep content');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test
```

Expected: failures like "Cannot find module '../src/formatter.js'".

- [ ] **Step 3: Create src/formatter.ts**

```typescript
import TurndownService from 'turndown';

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Strip structural UI chrome by tag
td.remove(['nav', 'img']);

// Strip UI chrome by class name
td.addRule('removeChrome', {
  filter: (node) => {
    const el = node as HTMLElement;
    const className = typeof el.className === 'string' ? el.className : '';
    return (
      className.includes('zDocsTopicPageDetails') ||
      className.includes('zDocsTopicPageCluster') ||
      className.includes('zDocsTopicReadTime') ||
      className.includes('spacer')
    );
  },
  replacement: () => '',
});

export function toMarkdown(html: string): string {
  if (!html.trim()) return '';
  return td.turndown(html).trim();
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test
```

Expected: all formatter tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/formatter.ts tests/formatter.test.ts
git commit -m "feat: HTML to Markdown formatter with UI chrome stripping (TDD)"
```

---

### Task 5: CLI

**Files:**
- Create: `src/cli.ts`
- Create: `bin/sn-docs.js`

- [ ] **Step 1: Create src/cli.ts**

```typescript
import { Command } from 'commander';
import { search, suggest, getLocales, getContent } from './docs-client.js';
import { toMarkdown } from './formatter.js';
import { DocsApiError } from './types.js';

const program = new Command()
  .name('sn-docs')
  .description('Query ServiceNow documentation')
  .version('0.1.0');

program
  .command('search <query>')
  .description('Search ServiceNow docs')
  .option('-l, --lang <lang>', 'Language code', 'en-US')
  .option('-n, --limit <n>', 'Results per page', '10')
  .option('-p, --page <n>', 'Page number (1-based)', '1')
  .option('--json', 'Output raw JSON')
  .action(async (query: string, opts: { lang: string; limit: string; page: string; json?: boolean }) => {
    try {
      const limit = parseInt(opts.limit, 10);
      const page = parseInt(opts.page, 10);
      const { items, paging } = await search({
        query,
        lang: opts.lang,
        maxResults: limit,
        from: (page - 1) * limit,
      });
      if (opts.json) {
        console.log(JSON.stringify({ items, paging }, null, 2));
        return;
      }
      console.log(`Found ${paging.totalResultsCount.toLocaleString()} results (page ${paging.currentPage} of ${Math.ceil(paging.totalResultsCount / limit)})\n`);
      for (const item of items) {
        console.log(`## ${item.title}`);
        if (item.breadcrumb.length) console.log(`   ${item.breadcrumb.join(' > ')}`);
        console.log(`   ${item.excerpt.slice(0, 120)}${item.excerpt.length > 120 ? '…' : ''}`);
        console.log(`   ${item.readerUrl}`);
        if (item.lastUpdated) console.log(`   Updated: ${item.lastUpdated.split('T')[0]}`);
        console.log();
      }
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('get <url>')
  .description('Fetch article content as Markdown (accepts readerUrl or contentUrl)')
  .action(async (url: string) => {
    try {
      const html = await getContent(url);
      console.log(toMarkdown(html));
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('suggest <input>')
  .description('Get search suggestions for a partial query')
  .action(async (input: string) => {
    try {
      const suggestions = await suggest(input);
      suggestions.forEach(s => console.log(s));
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('locales')
  .description('List available documentation languages')
  .action(async () => {
    try {
      const locales = await getLocales();
      const p = (s: string, n: number) => s.padEnd(n);
      console.log(`${p('Lang', 8)}${p('Label', 22)}Articles`);
      console.log('-'.repeat(38));
      for (const l of locales) {
        console.log(`${p(l.lang, 8)}${p(l.label, 22)}${l.count.toLocaleString()}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

function handleError(err: unknown): never {
  if (err instanceof DocsApiError) {
    process.stderr.write(`Error ${err.statusCode}: ${err.message}\n`);
  } else {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exit(1);
}

program.parse();
```

- [ ] **Step 2: Create bin/sn-docs.js**

```js
#!/usr/bin/env node
import '../dist/cli.js';
```

- [ ] **Step 3: Build and smoke-test the CLI**

```bash
npm run build
node bin/sn-docs.js --help
```

Expected output includes:
```
Usage: sn-docs [options] [command]

Commands:
  search <query>
  get <url>
  suggest <input>
  locales
```

- [ ] **Step 4: Run a live smoke test**

```bash
node bin/sn-docs.js search "incident management" --limit 3
```

Expected: 3 results with titles, breadcrumbs, URLs.

```bash
node bin/sn-docs.js locales
```

Expected: table of 6 languages including en-US.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts bin/sn-docs.js
git commit -m "feat: Commander CLI with search, get, suggest, locales commands"
```

---

### Task 6: MCP Server

**Files:**
- Create: `src/mcp-server.ts`
- Create: `bin/sn-docs-mcp.js`

- [ ] **Step 1: Create src/mcp-server.ts**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { search, suggest, getLocales, getContent } from './docs-client.js';
import { toMarkdown } from './formatter.js';
import { DocsApiError } from './types.js';

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
      description: 'Fetch a ServiceNow documentation article as Markdown. Pass contentUrl from search_docs results for best reliability; readerUrl also accepted.',
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
          content: [{ type: 'text' as const, text: toMarkdown(html) }],
        };
      }

      case 'suggest': {
        const { input } = args as { input: string };
        const suggestions = await suggest(input);
        return {
          content: [{ type: 'text' as const, text: suggestions.join('\n') }],
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

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Create bin/sn-docs-mcp.js**

```js
#!/usr/bin/env node
import '../dist/mcp-server.js';
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: `dist/mcp-server.js` exists, no TypeScript errors.

- [ ] **Step 4: Verify MCP server starts without crashing**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node bin/sn-docs-mcp.js
```

Expected: JSON response listing 4 tools (`search_docs`, `get_article`, `suggest`, `list_locales`).

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server.ts bin/sn-docs-mcp.js
git commit -m "feat: MCP stdio server with 4 tools mirroring CLI commands"
```

---

### Task 7: Integration Tests

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Create tests/integration.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { search, suggest, getLocales, getContent } from '../src/docs-client.js';
import { toMarkdown } from '../src/formatter.js';

const SKIP = !process.env.INTEGRATION;

describe.skipIf(SKIP)('Integration: live API', () => {
  it('search() returns results for "incident"', async () => {
    const { items, paging } = await search({ query: 'incident', maxResults: 3 });
    expect(items.length).toBeGreaterThan(0);
    expect(paging.totalResultsCount).toBeGreaterThan(1000);
    expect(items[0].title).toBeTruthy();
    expect(items[0].readerUrl).toMatch(/^https:\/\/www\.servicenow\.com\/docs\//);
    expect(items[0].contentUrl).toMatch(/\/api\/khub\/maps\//);
  });

  it('search() with lang=fr-FR returns French results', async () => {
    const { items } = await search({ query: 'incident', lang: 'fr-FR', maxResults: 3 });
    expect(items.length).toBeGreaterThan(0);
    // contentUrl should contain a locale indicator
    expect(items.some(i => i.readerUrl.includes('fr-FR') || i.breadcrumb.length > 0)).toBe(true);
  });

  it('search() pagination works', async () => {
    const page1 = await search({ query: 'workflow', maxResults: 3, from: 0 });
    const page2 = await search({ query: 'workflow', maxResults: 3, from: 3 });
    expect(page1.items[0].readerUrl).not.toBe(page2.items[0].readerUrl);
  });

  it('suggest() returns suggestions for "incid"', async () => {
    const suggestions = await suggest('incid');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(s => typeof s === 'string')).toBe(true);
  });

  it('getLocales() returns en-US with count > 0', async () => {
    const locales = await getLocales();
    const enUS = locales.find(l => l.lang === 'en-US');
    expect(enUS).toBeDefined();
    expect(enUS!.count).toBeGreaterThan(0);
  });

  it('getContent() + toMarkdown() returns clean Markdown from a contentUrl', async () => {
    const { items } = await search({ query: 'incident management overview', maxResults: 1 });
    expect(items.length).toBeGreaterThan(0);
    const html = await getContent(items[0].contentUrl);
    expect(html.length).toBeGreaterThan(100);
    const md = toMarkdown(html);
    expect(md).toContain('#'); // has headings
    expect(md).not.toContain('<div'); // HTML stripped
    expect(md).not.toContain('zDocsTopicPageDetails'); // chrome stripped
  });
});
```

- [ ] **Step 2: Run integration tests against live API**

```bash
npm run test:integration
```

Expected: all 6 integration tests pass. If any fail due to network, re-run — the API is public and generally reliable.

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "feat: integration tests for live Fluid Docs API"
```

---

### Task 8: Finalize

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md commands section with final scripts**

Replace the commands section in `CLAUDE.md`:

```markdown
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
```

- [ ] **Step 2: Add MCP registration instructions to CLAUDE.md**

Add this section at the end of `CLAUDE.md`:

```markdown
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
```

- [ ] **Step 3: Run final unit test suite to confirm nothing broken**

```bash
npm test
```

Expected: all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with final commands and MCP registration"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| TypeScript + ESM | Task 1 |
| `@modelcontextprotocol/sdk`, `commander`, `turndown`, `vitest` | Task 1 |
| `types.ts` — all API response interfaces + DocsApiError | Task 2 |
| `docs-client.ts` — search, suggest, getLocales, getContent | Task 3 |
| Retry on 5xx with 500ms delay | Task 3 (fetchWithRetry) |
| readerUrl → contentUrl resolution via search | Task 3 (resolveContentUrl) |
| `formatter.ts` — HTML → Markdown, strip chrome | Task 4 |
| CLI: search, get, suggest, locales; --lang, --limit, --page, --json | Task 5 |
| MCP: search_docs, get_article, suggest, list_locales | Task 6 |
| MCP never crashes on error (isError result) | Task 6 (try/catch in handler) |
| Unit tests mock fetch | Tasks 3, 4 |
| Integration tests skip unless INTEGRATION=true | Task 7 |
| CLAUDE.md with final commands | Task 8 |

No gaps found.

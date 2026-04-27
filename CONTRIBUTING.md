# Contributing

## Getting started

```bash
git clone https://github.com/wiz0floyd/sn-docs.git
cd sn-docs
npm install
npm test
```

## Making changes

1. Branch from `main` — never commit directly to main
2. Write tests first (TDD) — see existing tests in `tests/` for patterns
3. All tests must pass before opening a PR: `npm test`
4. Run `npm run lint` to catch TypeScript errors

## File structure

| File | Responsibility |
|---|---|
| `src/types.ts` | All shared interfaces — add new API types here |
| `src/docs-client.ts` | All HTTP calls — no business logic, just fetch + normalize |
| `src/formatter.ts` | HTML → Markdown conversion — turndown rules only |
| `src/cli.ts` | Commander commands — thin wrappers, delegate to client |
| `src/mcp-server.ts` | MCP tool handlers — thin wrappers, delegate to client |

**ESM import rule:** All relative imports in `.ts` files must use `.js` extension (e.g., `import { … } from './types.js'`). Node16 TypeScript resolution requires this.

## Adding a new API endpoint

1. Add response types to `src/types.ts`
2. Add the fetch function to `src/docs-client.ts` (use `request<T>` or `requestText` helpers)
3. Add unit tests in `tests/docs-client.test.ts` using `vi.stubGlobal('fetch', mockFetch)`
4. Expose it in both `src/cli.ts` (new command) and `src/mcp-server.ts` (new tool)
5. Add an integration test in `tests/integration.test.ts`

## Pull requests

- Keep PRs focused — one logical change per PR
- Include a clear description of what changed and why
- Link any related issues

## Versioning

Bump `package.json` version for any PR that changes code — it is the single source of truth (both `cli.ts` and `mcp-server.ts` read from it at runtime). Docs-only PRs (README, CONTRIBUTING.md) do not require a bump.

| Change type | Bump |
|---|---|
| Bug fix | patch (`1.0.0` → `1.0.1`) |
| New feature, backwards-compatible | minor (`1.0.0` → `1.1.0`) |
| Breaking change | major (`1.0.0` → `2.0.0`) |

## API notes

The Fluid Docs API base is `https://www.servicenow.com/docs/api/khub`. It is public and requires no authentication. The main endpoints are documented in `src/docs-client.ts`.

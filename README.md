# sn-docs

CLI and MCP server for querying [docs.servicenow.com](https://www.servicenow.com/docs/) via the ServiceNow Fluid Docs API. Enables Claude and other AI tools to search and retrieve official ServiceNow documentation at runtime — no authentication required.

## Requirements

- Node.js 20+

## Installation

### Option A: Download a release

Download `sn-docs-cli.cjs` or `sn-docs-mcp.cjs` from the [latest release](../../releases/latest). Both are single-file bundles — no `npm install` needed.

```bash
# CLI
node sn-docs-cli.cjs search "incident management" --limit 5

# MCP server (reference in your MCP config, see below)
node sn-docs-mcp.cjs
```

### Option B: Clone and build

```bash
git clone https://github.com/wiz0floyd/sn-docs.git
cd sn-docs
npm install
npm run build
node bin/sn-docs.js --help
```

## CLI Usage

```
sn-docs search <query>   Search documentation
sn-docs get <url>        Fetch article as Markdown
sn-docs suggest <input>  Get autocomplete suggestions
sn-docs locales          List available languages
```

### Options

| Flag | Commands | Default | Description |
|---|---|---|---|
| `-l, --lang` | search, get | `en-US` | Language code |
| `-n, --limit` | search | `10` | Results per page |
| `-p, --page` | search | `1` | Page number |
| `--json` | search | — | Raw JSON output |

### Examples

```bash
# Search with limit
sn-docs search "flow designer" --limit 5

# Search in French
sn-docs search "gestion des incidents" --lang fr-FR

# Fetch article as Markdown (use contentUrl from search results)
sn-docs get "https://www.servicenow.com/docs/api/khub/maps/abc/topics/xyz/content"

# Get suggestions while typing
sn-docs suggest "flow des"

# List available languages
sn-docs locales
```

### Search output

```
Found 42,830 results (page 1 of 4283)

## Flow Designer overview
   Now Platform > Application Development > Flow Designer
   Flow Designer is a Now Platform® feature for automating business logic...
   https://www.servicenow.com/docs/r/platform-app-dev/flow-designer-overview.html
   Updated: 2026-03-01
```

## MCP Server (Claude integration)

The MCP server exposes 4 tools to Claude:

| Tool | Description |
|---|---|
| `search_docs` | Search with query, lang, limit, page |
| `get_article` | Fetch article as Markdown by URL |
| `suggest` | Autocomplete suggestions |
| `list_locales` | Available languages |

### Register with Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "sn-docs": {
      "command": "node",
      "args": ["/path/to/sn-docs-mcp.mjs"]
    }
  }
}
```

### Register with Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "sn-docs": {
      "command": "node",
      "args": ["/path/to/sn-docs-mcp.mjs"]
    }
  }
}
```

Replace `/path/to/sn-docs-mcp.cjs` with the absolute path to the downloaded file or `dist/mcp-server.js` if building from source.

## Development

```bash
npm install
npm test                  # Unit tests (mocked, no network)
npm run test:integration  # Live API smoke tests
npm run build             # Compile TypeScript → dist/
npm run lint              # Type-check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE)

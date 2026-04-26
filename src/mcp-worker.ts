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
            version: { type: 'string', description: 'Release version: "current" (default, latest docs), a release name e.g. "zurich", "yokohama", "xanadu", or "any" (all versions)' },
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
          const { query, lang, version, limit, page } = args as {
            query: string; lang?: string; version?: string; limit?: number; page?: number;
          };
          const maxResults = Math.min(limit ?? 10, 50);
          const from = ((page ?? 1) - 1) * maxResults;
          const { items, paging } = await search({ query, lang, version, maxResults, from });
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

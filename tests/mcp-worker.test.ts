import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/docs-client.js', () => ({
  search: vi.fn(),
  suggest: vi.fn(),
  getLocales: vi.fn(),
  getContent: vi.fn(),
}));

import worker from '../src/mcp-worker.js';
import { getContent } from '../src/docs-client.js';

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

describe('get_article tool', () => {
  it('returns Markdown not raw HTML', async () => {
    vi.mocked(getContent).mockResolvedValue('<h1>Hello</h1>');

    const req = new Request('https://example.com/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_article', arguments: { url: 'https://example.com' } },
      }),
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
    });

    const res = await worker.fetch(req, makeEnv());
    const body = await res.text();
    // Response is SSE or JSON; either way the converted text should not start with '<'
    expect(body).toContain('# Hello');
    expect(body).not.toContain('<h1>');
  });
});

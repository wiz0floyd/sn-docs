import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, suggest, getLocales, getContent, _resetLocalesCache } from '../src/docs-client.js';
import { DocsApiError } from '../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  _resetLocalesCache();
});

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
    mockFetch
      .mockReturnValueOnce(ok({ contentLocales: [{ lang: 'en-US', label: 'English', count: 452 }, { lang: 'de-DE', label: 'Deutsch', count: 200 }] }))
      .mockReturnValueOnce(ok({ ...SEARCH_RESPONSE, results: [] }));
    await search({ query: 'flow', lang: 'de-DE', maxResults: 5, from: 10 });
    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ query: 'flow', lang: 'de-DE', maxResults: 5, from: 10 });
  });

  it('throws DocsApiError(400) for unsupported locale', async () => {
    mockFetch.mockReturnValueOnce(ok({ contentLocales: [{ lang: 'en-US', label: 'English', count: 452 }] }));
    await expect(search({ query: 'incident', lang: 'fr-FR' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('fr-FR') });
    expect(mockFetch).toHaveBeenCalledTimes(1); // locales only, no search call
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

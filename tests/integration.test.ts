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

  it('search() with lang=fr-FR throws DocsApiError (fr-FR not available)', async () => {
    await expect(search({ query: 'incident', lang: 'fr-FR', maxResults: 3 }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('fr-FR') });
  });

  it('search() pagination works', async () => {
    const page1 = await search({ query: 'request', maxResults: 10, from: 0 });
    const page2 = await search({ query: 'request', maxResults: 10, from: 10 });
    expect(page1.items.length).toBeGreaterThan(0);
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page1.paging.currentPage).toBeDefined();
    expect(page2.paging.currentPage).toBeDefined();
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
    expect(md).toContain('#');
    expect(md).not.toContain('<div');
    expect(md).not.toContain('zDocsTopicPageDetails');
  });
});

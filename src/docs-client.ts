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

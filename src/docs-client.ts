import type {
  SearchOptions, SearchResponse, SuggestResponse, LocalesResponse,
  SearchResultItem, ContentLocale,
} from './types.js';
import { DocsApiError } from './types.js';

const BASE = 'https://www.servicenow.com/docs/api/khub';
const TIMEOUT_MS = 10_000;

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise<void>(r => setTimeout(r, 500));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.ok || res.status < 500) return res;
      lastRes = res;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new DocsApiError(408, `Request timed out after ${TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
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
  await assertLangSupported(options.lang ?? 'en-US');
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

  const lang = options.lang ?? 'en-US';
  const version = options.version ?? 'current';

  // Lang filter: en-US URLs have no lang segment; others have /r/xx-XX/
  const isRequestedLang = (url: string) =>
    lang === 'en-US'
      ? !/\/docs\/r\/[a-z]{2}-[A-Z]{2}\//.test(url)
      : url.includes(`/docs/r/${lang}/`);

  // Version filter: ServiceNow release names are alphabetical city names.
  // Versioned URLs: /docs/r/<release>/<product>/... e.g. /docs/r/zurich/itsm/...
  // Current URLs:   /docs/r/<product>/...           e.g. /docs/r/itsm/...
  const KNOWN_RELEASES = new Set([
    'fuji', 'geneva', 'helsinki', 'istanbul', 'jakarta', 'kingston', 'london',
    'madrid', 'newyork', 'orlando', 'paris', 'quebec', 'rome', 'sandiego',
    'tokyo', 'utah', 'vancouver', 'washingtondc', 'xanadu', 'yokohama', 'zurich',
    'australia', 'brazil',
  ]);
  const RELEASE_RE = /\/docs\/r\/([a-z]+)\//;
  const getUrlVersion = (url: string): string => {
    const m = url.match(RELEASE_RE);
    return (m && KNOWN_RELEASES.has(m[1])) ? m[1] : 'current';
  };
  const isRequestedVersion = (url: string) =>
    version === 'any' || getUrlVersion(url) === version;

  const seen = new Set<string>();
  const items: SearchResultItem[] = [];
  for (const result of data.results) {
    for (const entry of result.entries) {
      if (entry.type !== 'TOPIC') continue;
      const t = entry.topic;
      if (!isRequestedLang(t.readerUrl)) continue;
      if (!isRequestedVersion(t.readerUrl)) continue;
      if (seen.has(t.contentUrl)) continue;
      seen.add(t.contentUrl);
      const excerpt = t.htmlExcerpt.replace(/<[^>]+>/g, '');
      const lastUpdated = t.metadata.find(m => m.key === 'last_updated_date')?.values[0] ?? '';
      items.push({ title: t.title, breadcrumb: t.breadcrumb, excerpt, readerUrl: t.readerUrl, contentUrl: t.contentUrl, lastUpdated });
      if (items.length >= (options.maxResults ?? 10)) break;
    }
    if (items.length >= (options.maxResults ?? 10)) break;
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

let _localesCache: ContentLocale[] | undefined;

export async function getLocales(): Promise<ContentLocale[]> {
  if (!_localesCache) {
    const data = await request<LocalesResponse>(`${BASE}/locales`);
    _localesCache = data.contentLocales;
  }
  return _localesCache;
}

/** Exposed for unit tests only — clears the locales cache. */
export function _resetLocalesCache(): void {
  _localesCache = undefined;
}

async function assertLangSupported(lang: string): Promise<void> {
  if (lang === 'en-US') return;
  const locales = await getLocales();
  const supported = locales.map(l => l.lang);
  if (!supported.includes(lang)) {
    throw new DocsApiError(
      400,
      `Locale '${lang}' is not available. Supported locales: ${supported.join(', ')}`,
    );
  }
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

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

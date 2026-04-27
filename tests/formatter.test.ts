import { describe, it, expect } from 'vitest';
import { toMarkdown, toMarkdownWorker } from '../src/formatter.js';

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

describe('toMarkdownWorker()', () => {
  it('converts h1 headings', () => {
    expect(toMarkdownWorker('<h1>Title</h1>')).toBe('# Title');
  });

  it('converts h2 headings', () => {
    expect(toMarkdownWorker('<h2>Section</h2>')).toBe('## Section');
  });

  it('converts unordered lists', () => {
    const result = toMarkdownWorker('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(result).toContain('- Item 1');
    expect(result).toContain('- Item 2');
  });

  it('converts ordered lists with sequential numbers', () => {
    const result = toMarkdownWorker('<ol><li>First</li><li>Second</li></ol>');
    expect(result).toContain('1. First');
    expect(result).toContain('2. Second');
  });

  it('wraps code blocks in fenced markdown', () => {
    const result = toMarkdownWorker('<pre><code>const x = 1;</code></pre>');
    expect(result).toContain('```');
    expect(result).toContain('const x = 1;');
  });

  it('does not double-decode escaped HTML entities in code blocks', () => {
    const result = toMarkdownWorker('<pre><code>&amp;lt;</code></pre>');
    expect(result).toContain('&lt;');
    expect(result).not.toContain('<<');
  });

  it('converts bold text', () => {
    expect(toMarkdownWorker('<strong>bold</strong>')).toBe('**bold**');
  });

  it('converts italic text', () => {
    expect(toMarkdownWorker('<em>italic</em>')).toBe('*italic*');
  });

  it('preserves links with double-quoted href', () => {
    const result = toMarkdownWorker('<a href="https://example.com">click here</a>');
    expect(result).toContain('[click here](https://example.com)');
  });

  it('preserves links with single-quoted href', () => {
    const result = toMarkdownWorker("<a href='https://example.com'>click here</a>");
    expect(result).toContain('[click here](https://example.com)');
  });

  it('strips nav elements entirely', () => {
    const result = toMarkdownWorker('<nav>Breadcrumb nav</nav><p>Content</p>');
    expect(result).not.toContain('Breadcrumb nav');
    expect(result).toContain('Content');
  });

  it('strips zDocsTopicPageDetails chrome without eating following content', () => {
    const result = toMarkdownWorker(
      '<div class="zDocsTopicPageDetails">Badge</div><p>Real content</p>',
    );
    expect(result).not.toContain('Badge');
    expect(result).toContain('Real content');
  });

  it('strips img elements', () => {
    const result = toMarkdownWorker('<img src="icon.png" alt="icon"><p>text</p>');
    expect(result).not.toContain('icon.png');
    expect(result).toContain('text');
  });

  it('returns empty string for empty input', () => {
    expect(toMarkdownWorker('')).toBe('');
  });
});

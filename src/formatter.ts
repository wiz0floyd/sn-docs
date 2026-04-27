import TurndownServiceDefault from 'turndown';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TurndownService = (TurndownServiceDefault as any).default ?? TurndownServiceDefault;

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Strip nav elements
td.remove(['nav']);

// Override img to strip entirely (td.remove doesn't override built-in image rule)
td.addRule('stripImages', {
  filter: 'img',
  replacement: () => '',
});

// Override listItem rule to use single space after marker (turndown default uses 3 spaces)
td.addRule('listItem', {
  filter: 'li',
  replacement: (content: string, node: HTMLElement) => {
    const parent = node.parentNode as HTMLElement;
    let prefix: string;
    if (parent && parent.nodeName === 'OL') {
      const start = parent.getAttribute('start');
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = (start ? Number(start) + index : index + 1) + '. ';
    } else {
      prefix = '- ';
    }
    const trimmed = content.replace(/^\n+|\n+$/g, '');
    const indented = trimmed.replace(/\n/gm, '\n' + ' '.repeat(prefix.length));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return prefix + indented + ((node as any).nextSibling ? '\n' : '');
  },
});

// Strip UI chrome by class name
td.addRule('removeChrome', {
  filter: (node: HTMLElement) => {
    const className = typeof node.className === 'string' ? node.className : '';
    return (
      className.includes('zDocsTopicPageDetails') ||
      className.includes('zDocsTopicPageCluster') ||
      className.includes('zDocsTopicReadTime') ||
      className.includes('spacer')
    );
  },
  replacement: () => '',
});

/** Converts HTML to Markdown using Turndown. Requires a DOM (Node.js / browser only). */
export function toMarkdown(html: string): string {
  if (!html.trim()) return '';
  return td.turndown(html).trim();
}

/**
 * DOM-free HTML→Markdown for Cloudflare Workers.
 * The workerd runtime does not expose `document` or `DOMParser`, so Turndown cannot be used.
 * Handles the HTML structures common in ServiceNow docs well enough for LLM consumption.
 * Chrome stripping is best-effort for deeply nested elements.
 */
export function toMarkdownWorker(html: string): string {
  if (!html.trim()) return '';

  function stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, '');
  }
  // Decode HTML entities for code block content. Processes &lt;/&gt; before &amp; so that
  // &amp;lt; → &lt; (one level: text content is "&lt;"), not &amp;lt; → &lt; → < (two levels).
  function decodeCodeEntities(s: string): string {
    return s
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  }

  // Extract code blocks first and replace with placeholders so that the entity
  // decoding pass at the end does not touch their already-decoded content.
  const codeBlocks: string[] = [];
  function saveCodeBlock(content: string): string {
    const idx = codeBlocks.length;
    codeBlocks.push(`\`\`\`\n${content.trim()}\n\`\`\`\n\n`);
    return `\x00CODE${idx}\x00`;
  }

  let s = html
    // Strip nav and ServiceNow UI chrome by class (best-effort: targets leaf/shallow elements)
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<img[^>]*\/?>/gi, '')
    .replace(/<[^>]*(zDocsTopicPageDetails|zDocsTopicPageCluster|zDocsTopicReadTime|spacer)[^>]*>[^<]*<\/\w+>/gi, '')
    // Extract code blocks before any entity decoding
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, t) => saveCodeBlock(decodeCodeEntities(stripTags(t))))
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => saveCodeBlock(decodeCodeEntities(stripTags(t))))
    // Ordered lists: convert <li> inside <ol> to numbered items before stripping tags
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
      let i = 0;
      return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, t: string) => `${++i}. ${stripTags(t).trim()}\n`);
    })
    // Unordered list wrappers (items handled below)
    .replace(/<ul[^>]*>|<\/ul>/gi, '')
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${stripTags(t).trim()}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${stripTags(t).trim()}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${stripTags(t).trim()}\n\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `#### ${stripTags(t).trim()}\n\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, t) => `##### ${stripTags(t).trim()}\n\n`)
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, t) => `###### ${stripTags(t).trim()}\n\n`)
    // Inline formatting
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${stripTags(t)}\``)
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, t) => `**${stripTags(t)}**`)
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_, t) => `**${stripTags(t)}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_, t) => `*${stripTags(t)}*`)
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_, t) => `*${stripTags(t)}*`)
    // Links — handle both single and double-quoted href
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${stripTags(text)}](${href})`)
    // Unordered list items (ordered list items already converted above)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${stripTags(t).trim()}\n`)
    // Block elements
    .replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // HTML entities for non-code content: &lt;/&gt; before &amp; preserves &amp;lt; → &lt;
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n');

  // Restore code blocks (already decoded; immune to entity pass above)
  codeBlocks.forEach((block, i) => {
    s = s.replace(`\x00CODE${i}\x00`, block);
  });

  return s.trim();
}

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

export function toMarkdown(html: string): string {
  if (!html.trim()) return '';
  return td.turndown(html).trim();
}

// DOM-free HTML→Markdown for Cloudflare Workers (no document/DOMParser available).
// Handles the HTML structures common in ServiceNow docs well enough for LLM consumption.
export function toMarkdownWorker(html: string): string {
  if (!html.trim()) return '';

  function stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, '');
  }
  function decodeEntities(s: string): string {
    return s
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  }

  return html
    // Strip nav and ServiceNow UI chrome by class
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<img[^>]*\/?>/gi, '')
    .replace(/<[^>]*(zDocsTopicPageDetails|zDocsTopicPageCluster|zDocsTopicReadTime|spacer)[^>]*>[\s\S]*?<\/\w+>/gi, '')
    // Code blocks before inline code
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, t) => `\`\`\`\n${decodeEntities(stripTags(t)).trim()}\n\`\`\`\n\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\`\`\`\n${decodeEntities(stripTags(t)).trim()}\n\`\`\`\n\n`)
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
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${stripTags(text)}](${href})`)
    // Lists
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${stripTags(t).trim()}\n`)
    // Block elements
    .replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Entities and whitespace
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

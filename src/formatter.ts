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

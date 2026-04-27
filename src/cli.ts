import { createRequire } from 'module';
import { Command } from 'commander';
import { search, suggest, getLocales, getContent } from './docs-client.js';
import { toMarkdown } from './formatter.js';
import { DocsApiError } from './types.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command()
  .name('sn-docs')
  .description('Query ServiceNow documentation')
  .version(version);

program
  .command('search <query>')
  .description('Search ServiceNow docs')
  .option('-l, --lang <lang>', 'Language code', 'en-US')
  .option('-v, --release-version <version>', 'Release version: "current" (default), a release name e.g. "zurich", or "any"', 'current')
  .option('-n, --limit <n>', 'Results per page', '10')
  .option('-p, --page <n>', 'Page number (1-based)', '1')
  .option('--json', 'Output raw JSON')
  .action(async (query: string, opts: { lang: string; releaseVersion: string; limit: string; page: string; json?: boolean }) => {
    try {
      const limit = parseInt(opts.limit, 10);
      const page = parseInt(opts.page, 10);
      if (isNaN(limit) || limit < 1) {
        process.stderr.write('Error: --limit must be a positive integer\n');
        process.exit(1);
      }
      if (isNaN(page) || page < 1) {
        process.stderr.write('Error: --page must be a positive integer\n');
        process.exit(1);
      }
      const { items, paging } = await search({
        query,
        lang: opts.lang,
        version: opts.releaseVersion,
        maxResults: limit,
        from: (page - 1) * limit,
      });
      if (opts.json) {
        console.log(JSON.stringify({ items, paging }, null, 2));
        return;
      }
      console.log(`Found ${paging.totalResultsCount.toLocaleString()} results (page ${paging.currentPage} of ${Math.ceil(paging.totalResultsCount / limit)})\n`);
      for (const item of items) {
        console.log(`## ${item.title}`);
        if (item.breadcrumb.length) console.log(`   ${item.breadcrumb.join(' > ')}`);
        console.log(`   ${item.excerpt.slice(0, 120)}${item.excerpt.length > 120 ? '…' : ''}`);
        console.log(`   ${item.readerUrl}`);
        if (item.lastUpdated) console.log(`   Updated: ${item.lastUpdated.split('T')[0]}`);
        console.log();
      }
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('get <url>')
  .description('Fetch article content as Markdown (accepts readerUrl or contentUrl)')
  .option('-l, --lang <lang>', 'Language code for readerUrl resolution', 'en-US')
  .action(async (url: string, opts: { lang: string }) => {
    try {
      const html = await getContent(url);
      console.log(toMarkdown(html));
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('suggest <input>')
  .description('Get search suggestions for a partial query')
  .action(async (input: string) => {
    try {
      const suggestions = await suggest(input);
      suggestions.forEach(s => console.log(s));
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('locales')
  .description('List available documentation languages')
  .action(async () => {
    try {
      const locales = await getLocales();
      const p = (s: string, n: number) => s.padEnd(n);
      console.log(`${p('Lang', 8)}${p('Label', 22)}Articles`);
      console.log('-'.repeat(38));
      for (const l of locales) {
        console.log(`${p(l.lang, 8)}${p(l.label, 22)}${l.count.toLocaleString()}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

function handleError(err: unknown): never {
  if (err instanceof DocsApiError) {
    process.stderr.write(`Error ${err.statusCode}: ${err.message}\n`);
  } else {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exit(1);
}

program.parse();

#!/usr/bin/env node
/**
 * Queries the ServiceNow Fluid Docs API for versioned URLs, extracts release
 * name segments, and compares against the allowlist in src/docs-client.ts.
 * Exits 0 with no output if nothing new. Exits 0 with new names on stdout if
 * new releases are found. The workflow uses stdout to decide whether to PR.
 *
 * Flags:
 *   --dry-run   Print what would change without writing src/docs-client.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_FILE = join(ROOT, 'src', 'docs-client.ts');

// Extract the current KNOWN_RELEASES set from the source file
function parseKnownReleases(src) {
  const m = src.match(/const KNOWN_RELEASES = new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error('Could not find KNOWN_RELEASES in docs-client.ts');
  return new Set(m[1].match(/'([a-z]+)'/g).map(s => s.replace(/'/g, '')));
}

// Query the API with a few common terms to maximise version coverage
async function fetchVersionSegments() {
  const segments = new Set();
  const LANG_RE = /\/docs\/r\/[a-z]{2}-[A-Z]{2}\//;
  const VERSION_RE = /\/docs\/r\/([a-z]+)\//;

  for (const query of ['incident', 'change management', 'service catalog']) {
    let res;
    try {
      res = await fetch('https://www.servicenow.com/docs/api/khub/clustered-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lang: 'en-US', maxResults: 50, from: 0 }),
      });
    } catch (err) {
      console.error(`Network error fetching versions for query "${query}": ${err.message}`);
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`API request failed for query "${query}": HTTP ${res.status}`);
      process.exit(1);
    }
    const data = await res.json();
    for (const result of data.results ?? []) {
      for (const entry of result.entries ?? []) {
        if (entry.type !== 'TOPIC') continue;
        const url = entry.topic?.readerUrl ?? '';
        if (LANG_RE.test(url)) continue;
        const m = url.match(VERSION_RE);
        if (m) segments.add(m[1]);
      }
    }
  }
  return segments;
}

let src;
try {
  src = readFileSync(CLIENT_FILE, 'utf8');
} catch (err) {
  console.error(`Failed to read ${CLIENT_FILE}: ${err.message}`);
  process.exit(1);
}

const known = parseKnownReleases(src);
const found = await fetchVersionSegments();

const newReleases = [...found].filter(v => !known.has(v)).sort();

if (newReleases.length === 0) {
  if (DRY_RUN) console.log('No new releases found.');
  process.exit(0);
}

console.log(`New releases found: ${newReleases.join(', ')}`);

if (DRY_RUN) {
  console.log('Dry run — src/docs-client.ts not modified.');
  process.exit(0);
}

// Patch the source file — insert new names at the end of the set literal
const updated = src.replace(
  /(const KNOWN_RELEASES = new Set\(\[[\s\S]*?)'(\s*\]\))/,
  (_, before, after) => `${before}', '${newReleases.join("', '")}${after}`,
);
try {
  writeFileSync(CLIENT_FILE, updated, 'utf8');
} catch (err) {
  console.error(`Failed to write ${CLIENT_FILE}: ${err.message}`);
  process.exit(1);
}
console.log('Updated src/docs-client.ts');

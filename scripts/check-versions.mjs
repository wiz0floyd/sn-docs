#!/usr/bin/env node
/**
 * Queries the ServiceNow Fluid Docs API for versioned URLs, extracts release
 * name segments, and compares against the allowlist in src/docs-client.ts.
 * Exits 0 with no output if nothing new. Exits 0 with new names on stdout if
 * new releases are found. The workflow uses stdout to decide whether to PR.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
    const res = await fetch('https://www.servicenow.com/docs/api/khub/clustered-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, lang: 'en-US', maxResults: 50, from: 0 }),
    });
    if (!res.ok) continue;
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

const src = readFileSync(CLIENT_FILE, 'utf8');
const known = parseKnownReleases(src);
const found = await fetchVersionSegments();

const newReleases = [...found].filter(v => !known.has(v)).sort();

if (newReleases.length === 0) {
  process.exit(0);
}

console.log(`New releases found: ${newReleases.join(', ')}`);

// Patch the source file — insert new names at the end of the set literal
const updated = src.replace(
  /(const KNOWN_RELEASES = new Set\(\[[\s\S]*?)'(\s*\]\))/,
  (_, before, after) => `${before}', '${newReleases.join("', '")}${after}`,
);
writeFileSync(CLIENT_FILE, updated, 'utf8');
console.log('Updated src/docs-client.ts');

#!/usr/bin/env node
/**
 * test-jpost.js — JPost date field diagnostic
 *
 * Fetches a JPost article and dumps every date-related signal:
 *  - <script type="application/ld+json"> blocks
 *  - <meta> tags with date-like content
 *  - <time> elements
 *  - Raw JSON keys: datePublished, dateModified, dateCreated, publishedAt, createdAt
 *    embedded anywhere in the page (including Next.js __next_f.push payloads)
 *
 * Usage: node test-jpost.js [url]
 */

const TEST_URL = process.argv[2] || 'https://www.jpost.com/israel-news/article-892638';

async function main() {
  console.log(`\n🔍 Fetching: ${TEST_URL}\n`);
  const res = await fetch(TEST_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.jpost.com/'
    }
  });
  console.log(`HTTP status: ${res.status}`);
  const html = await res.text();
  console.log(`Response size: ${html.length} bytes\n`);

  // ── 1. Classic <script type="application/ld+json"> blocks ────────────────
  console.log('━━━ <script type="application/ld+json"> blocks ━━━');
  const jsonLdRe = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  let ldCount = 0;
  while ((ldMatch = jsonLdRe.exec(html)) !== null) {
    ldCount++;
    console.log(`  [LD+JSON #${ldCount}]`);
    try {
      const parsed = JSON.parse(ldMatch[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of items) {
        if (obj['@type']) console.log(`    @type: ${obj['@type']}`);
        if (obj.datePublished) console.log(`    datePublished: ${obj.datePublished}`);
        if (obj.dateModified)  console.log(`    dateModified:  ${obj.dateModified}`);
        if (obj.dateCreated)   console.log(`    dateCreated:   ${obj.dateCreated}`);
      }
    } catch (e) {
      console.log(`    (parse error: ${e.message})`);
      console.log(`    raw: ${ldMatch[1].slice(0, 200)}`);
    }
  }
  if (ldCount === 0) console.log('  (none found — JPost now uses Next.js RSC payload, not classic LD+JSON)');

  // ── 2. <meta> tags with date content ────────────────────────────────────
  console.log('\n━━━ <meta> date tags ━━━');
  const metaRe = /<meta[^>]+(published_time|modified_time|date|created)[^>]*>/gi;
  let metaMatch;
  let metaCount = 0;
  while ((metaMatch = metaRe.exec(html)) !== null) {
    metaCount++;
    console.log(`  ${metaMatch[0].replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  if (metaCount === 0) console.log('  (none found)');

  // ── 3. <time> elements ────────────────────────────────────────────────
  console.log('\n━━━ <time> elements ━━━');
  const timeRe = /<time[^>]*datetime=["']([^"']+)["'][^>]*>/gi;
  let timeMatch;
  let timeCount = 0;
  while ((timeMatch = timeRe.exec(html)) !== null) {
    timeCount++;
    console.log(`  datetime="${timeMatch[1]}"`);
  }
  if (timeCount === 0) console.log('  (none found)');

  // ── 4. Raw JSON date fields (works even in __next_f.push payloads) ────────
  console.log('\n━━━ Raw JSON date keys anywhere in page ━━━');
  const fields = ['datePublished', 'dateModified', 'dateCreated', 'publishedAt', 'createdAt', 'publishDate', 'published_date'];
  for (const field of fields) {
    // Match "field":"value" where value looks like a date
    const re = new RegExp(`"${field}":"([^"]+)"`, 'g');
    const matches = [...html.matchAll(re)];
    const unique = [...new Set(matches.map(m => m[1]))];
    if (unique.length > 0) {
      console.log(`  "${field}": ${unique.join(', ')}`);
    }
  }

  // ── 5. Test the fix: extract datePublished by raw regex ──────────────────
  console.log('\n━━━ Extraction test (new strategy) ━━━');
  const rawDatePublished = html.match(/"datePublished":"([^"]+)"/);
  if (rawDatePublished) {
    const d = new Date(rawDatePublished[1]);
    console.log(`  Raw match: ${rawDatePublished[1]}`);
    console.log(`  Parsed ISO: ${d.toISOString()}`);
    console.log(`  Is past: ${d.getTime() <= Date.now()}`);
    console.log(`  Minutes ago: ${Math.round((Date.now() - d.getTime()) / 60000)}`);
  } else {
    console.log('  ❌ "datePublished" not found in raw HTML');
  }

  // Also try dateModified for comparison
  const rawDateModified = html.match(/"dateModified":"([^"]+)"/);
  if (rawDateModified) {
    const d = new Date(rawDateModified[1]);
    console.log(`\n  dateModified: ${rawDateModified[1]}`);
    console.log(`  Parsed ISO: ${d.toISOString()}`);
    console.log(`  Is past: ${d.getTime() <= Date.now()}`);
  }

  console.log('\n✅ Done.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

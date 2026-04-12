// ===== DAILY ARTICLE PERSISTENCE =====
// Store and deduplicate articles by date, using atomic writes (Item #9).

const fs = require('fs');
const path = require('path');
const { TIMEZONE } = require('./config');
const { atomicWriteSync } = require('./utils');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Get YYYY-MM-DD based on Israel calendar date.
 */
function getIsraelDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/**
 * Load, merge, and atomically write articles for a single date bucket.
 *
 * Deduplication/update logic:
 *   - For articles whose URL is in the new fetch: refresh title, snippet, date.
 *   - For articles no longer in the new fetch: keep as-is but clamp future timestamps.
 *   - Purge any URLs in purgeSet before merging.
 *
 * @param {string} dateStr      - YYYY-MM-DD bucket to update.
 * @param {Array}  newArticles  - Incoming articles belonging to this bucket.
 * @param {Set}    purgeSet     - URLs to forcibly evict from the archive.
 */
function persistDateBucket(dateStr, newArticles, purgeSet) {
  const dailyFile = path.join(DATA_DIR, `${dateStr}.json`);

  // Load existing articles for this date bucket
  let existing = [];
  if (fs.existsSync(dailyFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
    } catch (e) {
      console.warn(`  ⚠️  Could not parse ${dailyFile}, starting fresh`);
      existing = [];
    }
  }

  // Purge pre-scheduled / stale articles requested by the caller
  if (purgeSet.size > 0) {
    const before = existing.length;
    existing = existing.filter(a => !purgeSet.has(a.link));
    const purged = before - existing.length;
    if (purged > 0) {
      console.log(`  🗑️  [${dateStr}] Purged ${purged} pre-scheduled article(s) from archive`);
    }
  }

  // Deduplicate by URL — always refresh mutable fields from the latest fetch.
  //
  // Old behaviour: ignore incoming articles whose URL already exists in the store.
  // Problem: publishers update headlines and snippets after initial publication,
  //   and JPost pre-schedules articles with future pubDates. Ignoring incoming data
  //   froze stale headlines and bad timestamps forever.
  //
  // New behaviour:
  //   For every existing article whose URL appears in the new fetch:
  //     • Update title — publishers fix typos, sharpen headlines post-publish
  //     • Update snippet — content improves or expands after initial post
  //     • Update date — critical for JPost future-date correction; also normalises
  //       any previously stored RFC 2822 strings into strict ISO UTC format
  //   Only fields that define the article's identity (source, color, logo, link)
  //   are preserved from the original stored record.
  //
  //   For articles NOT in the new fetch: keep as-is, but clamp any lingering future
  //   timestamps to now so they stop floating to the top of the feed.
  const nowMs = Date.now();
  const incomingByUrl = new Map(newArticles.map(a => [a.link, a]));

  let updateCount = 0;
  let dateCorrectionCount = 0;
  const updatedExisting = existing.map(a => {
    const incoming = incomingByUrl.get(a.link);
    if (incoming) {
      const changed =
        incoming.title !== a.title ||
        incoming.snippet !== a.snippet ||
        incoming.date !== a.date;
      if (changed) updateCount++;
      return {
        ...a,
        title: incoming.title,
        snippet: incoming.snippet,
        date: incoming.date,
        // Preserve Hebrew translations if present
        ...(incoming.title_he !== undefined && { title_he: incoming.title_he }),
        ...(incoming.snippet_he !== undefined && { snippet_he: incoming.snippet_he }),
      };
    }
    // Clamp lingering future timestamps
    const storedDateMs = new Date(a.date).getTime();
    if (storedDateMs > nowMs) {
      dateCorrectionCount++;
      return { ...a, date: new Date(nowMs).toISOString() };
    }
    return a;
  });

  if (updateCount > 0) {
    console.log(`  ✏️  [${dateStr}] Refreshed ${updateCount} existing article(s)`);
  }
  if (dateCorrectionCount > 0) {
    console.log(`  🕐 [${dateStr}] Clamped ${dateCorrectionCount} article(s) with future timestamps`);
  }

  const seenUrls = new Set(existing.map(a => a.link));
  const brandNewArticles = newArticles.filter(a => !seenUrls.has(a.link));

  const merged = [...updatedExisting, ...brandNewArticles];
  merged.sort((a, b) => new Date(b.date) - new Date(a.date));

  atomicWriteSync(dailyFile, JSON.stringify(merged, null, 2));
  console.log(`📁 [${dateStr}] ${dailyFile.split('/').pop()} — ${merged.length} articles (${brandNewArticles.length} new, ${updateCount} updated)`);

  return merged;
}

/**
 * Persist articles to daily JSON files, binning each article by its own
 * publication date (Israel timezone) rather than the current fetch date.
 *
 * This prevents duplication: an April 10th article fetched on April 12th
 * goes into 2026-04-10.json, not 2026-04-12.json.
 *
 * Returns articles from today AND yesterday so that at 12:01am the live
 * dashboard still has enough content (frontend caps at 100).
 *
 * @param {Array} articles  - Fresh articles from this fetch run.
 * @param {Array} [purgeUrls=[]] - URLs to forcibly remove from the archive.
 */
function persistDailyArticles(articles, purgeUrls = []) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const purgeSet = new Set(purgeUrls);

  // --- Bin articles by their own publication date (Israel tz) ---
  const buckets = new Map(); // dateStr -> Array<article>
  for (const a of articles) {
    const dateStr = getIsraelDateStr(new Date(a.date));
    if (!buckets.has(dateStr)) buckets.set(dateStr, []);
    buckets.get(dateStr).push(a);
  }

  console.log(`  📦 Binning ${articles.length} articles across ${buckets.size} date bucket(s): ${[...buckets.keys()].sort().join(', ')}`);

  // --- Write each bucket ---
  const bucketResults = new Map(); // dateStr -> merged array
  for (const [dateStr, bucketArticles] of buckets) {
    const merged = persistDateBucket(dateStr, bucketArticles, purgeSet);
    bucketResults.set(dateStr, merged);
  }

  // --- Build the return value: today + yesterday articles ---
  // This ensures the build step always has enough content even at midnight.
  const today = getIsraelDateStr(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getIsraelDateStr(yesterdayDate);

  const loadBucket = (dateStr) => {
    // Prefer already-computed result (avoids redundant disk read)
    if (bucketResults.has(dateStr)) return bucketResults.get(dateStr);
    const dailyFile = path.join(DATA_DIR, `${dateStr}.json`);
    if (fs.existsSync(dailyFile)) {
      try {
        return JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
      } catch (e) {
        return [];
      }
    }
    return [];
  };

  const todayArticles = loadBucket(today);
  const yesterdayArticles = loadBucket(yesterday);

  // Merge today + yesterday, deduplicate by URL, sort descending
  const seenLinks = new Set();
  const combined = [];
  for (const a of [...todayArticles, ...yesterdayArticles]) {
    if (!seenLinks.has(a.link)) {
      seenLinks.add(a.link);
      combined.push(a);
    }
  }
  combined.sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(`📊 Return set: ${todayArticles.length} today (${today}) + ${yesterdayArticles.length} yesterday (${yesterday}) = ${combined.length} unique articles`);

  return combined;
}

module.exports = { persistDailyArticles, getIsraelDateStr };

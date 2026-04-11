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
 * Persist articles to a daily JSON file, deduplicating by URL.
 * Uses atomic write to prevent corruption.
 */
function persistDailyArticles(articles) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const today = getIsraelDateStr(new Date());
  const dailyFile = path.join(DATA_DIR, `${today}.json`);

  // Load existing articles for today
  let existing = [];
  if (fs.existsSync(dailyFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
    } catch (e) {
      console.warn('Could not parse existing daily file, starting fresh');
      existing = [];
    }
  }

  // Deduplicate by URL — but always refresh mutable fields from the latest fetch.
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
  const incomingByUrl = new Map(articles.map(a => [a.link, a]));

  let updateCount = 0;
  let dateCorrectionCount = 0;
  const updatedExisting = existing.map(a => {
    const incoming = incomingByUrl.get(a.link);
    if (incoming) {
      // Article is still in the live feed — refresh title, snippet, and date.
      const changed =
        incoming.title !== a.title ||
        incoming.snippet !== a.snippet ||
        incoming.date !== a.date;
      if (changed) updateCount++;
      return {
        ...a,                      // keep identity fields (source, color, logo, etc.)
        title: incoming.title,     // always use freshest headline
        snippet: incoming.snippet, // always use freshest snippet
        date: incoming.date        // always use fetcher-normalised ISO date
      };
    }
    // Article is no longer in the live feed — keep stored data but fix future dates.
    const storedDateMs = new Date(a.date).getTime();
    if (storedDateMs > nowMs) {
      dateCorrectionCount++;
      return { ...a, date: new Date(nowMs).toISOString() };
    }
    return a;
  });

  if (updateCount > 0) {
    console.log(`  ✏️  Refreshed ${updateCount} existing article(s) with updated title/snippet/date`);
  }
  if (dateCorrectionCount > 0) {
    console.log(`  🕐 Clamped ${dateCorrectionCount} article(s) with lingering future timestamps`);
  }

  const seenUrls = new Set(existing.map(a => a.link));
  const newArticles = articles.filter(a => !seenUrls.has(a.link));

  const merged = [...updatedExisting, ...newArticles];
  merged.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Atomic write (Item #9)
  atomicWriteSync(dailyFile, JSON.stringify(merged, null, 2));
  console.log(`📁 Daily archive: ${dailyFile} — ${merged.length} articles (${newArticles.length} new, ${updateCount} updated)`);
  return merged;
}

module.exports = { persistDailyArticles, getIsraelDateStr };

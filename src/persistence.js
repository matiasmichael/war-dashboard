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

  // Deduplicate by URL.
  // Important: if an existing article has a future date (e.g. JPost pre-schedules
  // articles with future pubDates), update its date from the incoming fetch which
  // has already been clamped to "now" by the fetcher. This prevents stale future
  // timestamps from being frozen in the daily JSON once the article is seen.
  const nowMs = Date.now();
  const incomingByUrl = new Map(articles.map(a => [a.link, a]));

  let dateCorrectionCount = 0;
  const correctedExisting = existing.map(a => {
    const storedDateMs = new Date(a.date).getTime();
    if (storedDateMs > nowMs) {
      // The stored date is in the future — try to correct it from incoming data.
      const incoming = incomingByUrl.get(a.link);
      if (incoming) {
        // Use the fetcher's already-clamped date (guaranteed ≤ now)
        dateCorrectionCount++;
        return { ...a, date: incoming.date };
      } else {
        // Article not in current feed — clamp to now so it stops floating to the top
        dateCorrectionCount++;
        return { ...a, date: new Date(nowMs).toISOString() };
      }
    }
    return a;
  });

  if (dateCorrectionCount > 0) {
    console.log(`  🕐 Corrected ${dateCorrectionCount} article(s) with future timestamps in daily store`);
  }

  const seenUrls = new Set(correctedExisting.map(a => a.link));
  const newArticles = articles.filter(a => !seenUrls.has(a.link));

  const merged = [...correctedExisting, ...newArticles];
  merged.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Atomic write (Item #9)
  atomicWriteSync(dailyFile, JSON.stringify(merged, null, 2));
  console.log(`📁 Daily archive: ${dailyFile} — ${merged.length} articles (${newArticles.length} new)`);
  return merged;
}

module.exports = { persistDailyArticles, getIsraelDateStr };

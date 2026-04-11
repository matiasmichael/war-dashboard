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

  // Deduplicate by URL
  const seenUrls = new Set(existing.map(a => a.link));
  const newArticles = articles.filter(a => !seenUrls.has(a.link));

  const merged = [...existing, ...newArticles];
  merged.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Atomic write (Item #9)
  atomicWriteSync(dailyFile, JSON.stringify(merged, null, 2));
  console.log(`📁 Daily archive: ${dailyFile} — ${merged.length} articles (${newArticles.length} new)`);
  return merged;
}

module.exports = { persistDailyArticles, getIsraelDateStr };

// ===== RSS FETCHING + FILTERING =====
// Parallel fetching with per-feed retry (Items #2, #5, #10).

const RssParser = require('rss-parser');
const {
  FEEDS,
  MAX_ARTICLES_PER_SOURCE,
  RSS_TIMEOUT_MS,
  RSS_RETRY_ATTEMPTS,
  RSS_RETRY_DELAY_MS,
  getFaviconUrl
} = require('./config');
const { filterByKeywords, cleanSnippet, sleep } = require('./utils');
const { FULL_SNIPPET_LENGTH } = require('./config');

const parser = new RssParser({
  timeout: RSS_TIMEOUT_MS,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  }
});

/**
 * Fetch a single RSS feed with retry logic (Item #5).
 * Returns { feed, articles } on success.
 * Throws on final failure after retries.
 */
async function fetchSingleFeed(feed) {
  let lastError;
  for (let attempt = 1; attempt <= RSS_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await parser.parseURL(feed.url);
      let items = result.items || [];
      items = filterByKeywords(items, feed.keywords);

      // Take top N per source
      items = items.slice(0, MAX_ARTICLES_PER_SOURCE);

      // Generic stale filter using config property (Item #10)
      if (feed.staleThresholdHours) {
        const thresholdMs = feed.staleThresholdHours * 60 * 60 * 1000;
        const nowMs = Date.now();
        const beforeCount = items.length;
        items = items.filter(item => {
          const dateStr = item.isoDate || item.pubDate;
          if (!dateStr) {
            item._noDate = true;
            return true;
          }
          const articleDate = new Date(dateStr);
          if (isNaN(articleDate.getTime())) {
            item._noDate = true;
            return true;
          }
          return (nowMs - articleDate.getTime()) < thresholdMs;
        });
        const removed = beforeCount - items.length;
        if (removed > 0) {
          console.log(`  🗑️  ${feed.name}: filtered ${removed} stale articles (>${feed.staleThresholdHours}h old)`);
        }
      }

      const faviconUrl = getFaviconUrl(feed.faviconDomain);
      const articles = items.map(item => ({
        title: item.title || 'Untitled',
        link: item.link || '#',
        snippet: cleanSnippet(item.contentSnippet || item.content || '', FULL_SNIPPET_LENGTH),
        date: item.isoDate || item.pubDate || new Date().toISOString(),
        source: feed.name,
        logo: feed.emoji,
        color: feed.color,
        accentLight: feed.accentLight,
        publisherLogo: faviconUrl,
        noDate: item._noDate || false
      }));

      return { feed, articles };
    } catch (err) {
      lastError = err;
      if (attempt < RSS_RETRY_ATTEMPTS) {
        console.warn(`  ⟳ ${feed.name}: attempt ${attempt} failed (${err.message}), retrying in ${RSS_RETRY_DELAY_MS / 1000}s...`);
        await sleep(RSS_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

/**
 * Fetch all feeds in parallel using Promise.allSettled (Item #2).
 * Returns { articles, sourceStats }.
 */
async function fetchAllFeeds() {
  console.log(`Fetching ${FEEDS.length} feeds in parallel...`);

  const results = await Promise.allSettled(
    FEEDS.map(feed => {
      console.log(`  → ${feed.name}...`);
      return fetchSingleFeed(feed);
    })
  );

  const allArticles = [];
  const sourceStats = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feed = FEEDS[i];

    if (result.status === 'fulfilled') {
      const { articles } = result.value;
      allArticles.push(...articles);
      sourceStats.push({ name: feed.name, logo: feed.emoji, count: articles.length });
      console.log(`  ✓ ${feed.name}: ${articles.length} articles`);
    } else {
      console.error(`  ✗ ${feed.name}: ${result.reason.message}`);
      sourceStats.push({ name: feed.name, logo: feed.emoji, count: 0, error: true });
    }
  }

  // Sort by date, newest first
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { articles: allArticles, sourceStats };
}

module.exports = { fetchAllFeeds };

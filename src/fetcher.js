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
 * Fix malformed XML from RSS feeds with common encoding issues.
 * Handles: unescaped `&`, bare `<` in text (e.g. JavaScript `<=` inside content),
 * and HTML fragments that weren't CDATA-wrapped.
 *
 * Strategy: for each <item>...</item>, wrap the inner content of known text elements
 * (description, content:encoded) in CDATA if they contain bare HTML/script.
 * Also globally escapes unescaped `&`.
 */
function sanitizeXml(xml) {
  // 1. Fix unescaped & that aren't valid XML entities
  xml = xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, '&amp;');

  // 2. Wrap content of common RSS text elements in CDATA if not already wrapped.
  //    Match greedily within each element to capture embedded HTML/scripts.
  const tagsToWrap = ['description', 'content:encoded', 'content'];
  for (const tag of tagsToWrap) {
    const escapedTag = tag.replace(':', ':');
    // Use a regex that matches from <tag> to </tag>, capturing everything between.
    // The `s` flag lets . match newlines.
    const re = new RegExp(`<${escapedTag}>(?!\\s*<!\\[CDATA\\[)([\\s\\S]*?)<\\/${escapedTag}>`, 'g');
    xml = xml.replace(re, (_match, content) => {
      // Wrap in CDATA — escape any existing ]]> inside to prevent premature close
      const safe = content.replace(/]]>/g, ']]]]><![CDATA[>');
      return `<${tag}><![CDATA[${safe}]]></${tag}>`;
    });
  }

  return xml;
}

/**
 * Fetch raw XML text from a URL and pre-process it before parsing.
 * Used for feeds with known malformed XML (e.g. Haaretz).
 */
async function fetchAndSanitizeXml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    const rawXml = await res.text();
    return sanitizeXml(rawXml);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch a single RSS feed with retry logic (Item #5).
 * Returns { feed, articles } on success.
 * Throws on final failure after retries.
 */
async function fetchSingleFeed(feed) {
  let lastError;
  for (let attempt = 1; attempt <= RSS_RETRY_ATTEMPTS; attempt++) {
    try {
      // Pre-process XML for feeds with known malformed content (e.g. Haaretz unescaped &)
      let result;
      if (feed.sanitizeXml) {
        const cleanedXml = await fetchAndSanitizeXml(feed.url);
        result = await parser.parseString(cleanedXml);
      } else {
        result = await parser.parseURL(feed.url);
      }
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
      const articles = items.map(item => {
        // Never fall back to Date.now() for missing pubDates
        // That makes old undated articles appear as "just now"
        let parsedDate = item.isoDate || item.pubDate;
        let isInvalid = false;
        
        if (!parsedDate || isNaN(new Date(parsedDate).getTime())) {
          // It's missing or malformed. Set a fallback far in the past so it doesn't jump to the top
          // The UI will handle it gracefully based on the noDate flag
          parsedDate = new Date('2000-01-01T00:00:00Z').toISOString();
          isInvalid = true;
        } else {
          // If a feed sends a date from the future, clamp it to now
          if (new Date(parsedDate).getTime() > Date.now()) {
            parsedDate = new Date().toISOString();
          }
        }
        
        return {
          title: item.title || 'Untitled',
          link: item.link || '#',
          snippet: cleanSnippet(item.contentSnippet || item.content || '', FULL_SNIPPET_LENGTH),
          date: parsedDate,
          source: feed.name,
          logo: feed.emoji,
          color: feed.color,
          accentLight: feed.accentLight,
          publisherLogo: faviconUrl,
          noDate: item._noDate || isInvalid
        };
      });

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

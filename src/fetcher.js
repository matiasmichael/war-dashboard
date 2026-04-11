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
const { filterByKeywords, cleanSnippet, cleanTitle, sleep } = require('./utils');
const { FULL_SNIPPET_LENGTH } = require('./config');

const parser = new RssParser({
  timeout: RSS_TIMEOUT_MS,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  },
  customFields: {
    // JPost includes <UpdateDate> alongside <pubDate> — capture it for fallback use
    item: [['UpdateDate', 'updateDate']]
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
 * Fetch the real publish time for an article by scraping its JSON-LD schema.
 * Used for feeds where the RSS pubDate may be a pre-scheduled future timestamp
 * that doesn't match the actual publication time shown on the article page.
 * The JSON-LD `datePublished` field is authoritative.
 *
 * Strategy order:
 *  1. JSON-LD <script type="application/ld+json"> — most reliable (NewsArticle schema)
 *  2. OpenGraph <meta property="article:published_time"> — widely supported fallback
 *
 * Returns an ISO date string on success, or null on failure/timeout.
 * Previously named `fetchJPostRealPublishDate`; renamed to reflect generic use.
 */
async function fetchRealPublishDate(url) {
  const controller = new AbortController();
  // Use a tight per-article timeout — we fire these in parallel for all future-dated articles
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Strategy 1: Parse JSON-LD schema (most reliable — JPost embeds full NewsArticle schema)
    // Look for "datePublished":"..." inside any <script type="application/ld+json"> block
    const jsonLdMatches = html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const schema = JSON.parse(match[1]);
        const candidates = Array.isArray(schema) ? schema : [schema];
        for (const obj of candidates) {
          if (obj.datePublished) {
            const d = new Date(obj.datePublished);
            if (!isNaN(d.getTime()) && d.getTime() <= Date.now()) {
              return d.toISOString();
            }
          }
        }
      } catch (_) {
        // malformed JSON-LD — try next
      }
    }

    // Strategy 2: <meta property="article:published_time"> OpenGraph tag
    const ogMatch = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)
                 || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i);
    if (ogMatch) {
      const d = new Date(ogMatch[1]);
      if (!isNaN(d.getTime()) && d.getTime() <= Date.now()) {
        return d.toISOString();
      }
    }

    return null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeoutId);
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

      // For JPost: rss-parser won't pick up the custom <UpdateDate> field unless
      // customFields is configured (done above). Attach it for use during date resolution.
      // (items already have item.updateDate via the customFields config)

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

      // --- JPost future-date correction ---
      // JPost pre-schedules articles: they appear in the RSS feed with a pubDate that is
      // still in the future (e.g. scheduled for 2 hours from now), but the article page
      // already shows the real publish time in its JSON-LD schema.
      // We fire parallel HEAD-less fetches for any JPost article whose pubDate is in the
      // future, then swap in the real datePublished scraped from the article HTML.
      if (feed.fixFutureDates) {
        const nowMs = Date.now();
        const futureDateItems = items.filter(item => {
          const dateStr = item.isoDate || item.pubDate;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return !isNaN(d.getTime()) && d.getTime() > nowMs;
        });

        if (futureDateItems.length > 0) {
          console.log(`  🔍 ${feed.name}: ${futureDateItems.length} article(s) have future pubDates — fetching real publish times...`);
          // Parallel fetch with per-article timeout (already baked into fetchJPostRealPublishDate)
          const realDates = await Promise.all(
            futureDateItems.map(async item => {
              const url = item.link;
              if (!url || url === '#') return { item, realDate: null };
              const realDate = await fetchRealPublishDate(url);
              return { item, realDate };
            })
          );
          for (const { item, realDate } of realDates) {
            if (realDate) {
              console.log(`  ✅ ${feed.name}: corrected date for "${(item.title || '').slice(0, 50)}" → ${realDate}`);
              item._correctedDate = realDate;
            } else {
              // Could not fetch real date — fall back to clamping to now
              console.log(`  ⏰ ${feed.name}: could not fetch real date for "${(item.title || '').slice(0, 50)}" — clamping to now`);
              item._correctedDate = new Date().toISOString();
            }
          }
        }
      }

      const articles = items.map(item => {
        // --- Date normalization ---
        // Always produce a strict ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ).
        // rss-parser sets `isoDate` (already ISO) when it can parse the pubDate;
        // but falls back to the raw `pubDate` string (RFC 2822) when parsing fails.
        // We therefore always run the result through `new Date().toISOString()` to
        // guarantee a uniform format and UTC normalisation before saving.
        let rawDate = item.isoDate || item.pubDate;
        let parsedDate;
        let isInvalid = false;

        if (!rawDate) {
          // Missing date — sentinel far in the past so it doesn't jump to the top.
          // The UI handles it gracefully via the noDate flag.
          parsedDate = new Date('2000-01-01T00:00:00Z').toISOString();
          isInvalid = true;
        } else {
          const d = new Date(rawDate);
          if (isNaN(d.getTime())) {
            // Malformed date string
            parsedDate = new Date('2000-01-01T00:00:00Z').toISOString();
            isInvalid = true;
          } else if (d.getTime() > Date.now()) {
            // pubDate is in the future
            if (item._correctedDate) {
              // Use the real date scraped from the article page
              parsedDate = item._correctedDate; // already ISO from fetchRealPublishDate
            } else if (feed.fixFutureDates) {
              // fixFutureDates feed but scrape failed — clamp to now
              parsedDate = new Date().toISOString();
            } else {
              // Feed with unexpected future date — clamp to now
              parsedDate = new Date().toISOString();
              console.log(`  ⏰ Future pubDate clamped to now for: ${item.title ? item.title.slice(0, 60) : 'unknown'}`);
            }
          } else {
            // Normal past date — normalise to strict ISO UTC string regardless of
            // whether input was RFC 2822, ISO with offset, etc.
            parsedDate = d.toISOString();
          }
        }

        return {
          title: cleanTitle(item.title || 'Untitled'),
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
  // Skip feeds that are formally disabled (e.g. Haaretz — paywall-blocked RSS endpoint)
  const activeFeeds = FEEDS.filter(f => !f.disabled);
  const skippedFeeds = FEEDS.filter(f => f.disabled);

  if (skippedFeeds.length > 0) {
    console.log(`⚠️  Skipping ${skippedFeeds.length} disabled feed(s): ${skippedFeeds.map(f => f.name).join(', ')}`);
  }

  console.log(`Fetching ${activeFeeds.length} feeds in parallel...`);

  const results = await Promise.allSettled(
    activeFeeds.map(feed => {
      console.log(`  → ${feed.name}...`);
      return fetchSingleFeed(feed);
    })
  );

  const allArticles = [];
  const sourceStats = [];

  // Add disabled feeds to stats as permanently skipped
  for (const feed of skippedFeeds) {
    sourceStats.push({ name: feed.name, logo: feed.emoji, count: 0, disabled: true });
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feed = activeFeeds[i];

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

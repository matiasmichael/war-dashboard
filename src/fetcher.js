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
 * Correct JPost's mislabeled timezone in RSS pubDate values.
 *
 * ROOT CAUSE: JPost's RSS feed stamps all pubDate values in Israel local time
 * (IDT in summer = UTC+3, IST in winter = UTC+2) but labels them as "GMT".
 * This causes articles to appear 2–3 hours in the future when parsed literally.
 *
 * FIX: Determine the Israel UTC offset for the article's timestamp using the
 * Intl API (which correctly handles DST transitions between IST and IDT),
 * then subtract that offset so the stored UTC value reflects the true moment.
 *
 * Example: RSS says "Sat, 11 Apr 2026 21:18:16 GMT"
 *   → parsed as 21:18 UTC  (wrong — it's actually 21:18 IDT)
 *   → Israel offset on that date: +180 min (IDT, UTC+3)
 *   → corrected UTC: 21:18 UTC − 3h = 18:18 UTC  ✓
 */
function correctJPostTimezone(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  // Get the Israel local time components for this timestamp.
  // Intl handles DST automatically — IDT (UTC+3, Apr–Oct) vs IST (UTC+2, Oct–Apr).
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  // Reconstruct the Israel local time as if it were UTC, to measure the offset
  const israelLocalAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = israelLocalAsUtc - d.getTime(); // e.g. +10800000 ms for IDT (UTC+3)

  // The pubDate was stamped in Israel local time but labeled GMT.
  // True UTC = mislabeled-UTC − Israel-offset
  return new Date(d.getTime() - offsetMs).toISOString();
}

/**
 * Fetch the real publish time for an article by scraping its page.
 * Retained as a secondary validation tool — the primary JPost timezone fix is
 * correctJPostTimezone() above. This scraper handles any residual edge cases.
 *
 * JPost (and similar Next.js-based sites) embed date info in multiple ways:
 *  1. Classic <script type="application/ld+json"> — preferred when present.
 *  2. Raw JSON key-value pairs embedded in Next.js __next_f.push() payloads.
 *  3. OpenGraph <meta property="article:published_time"> — last resort.
 *
 * Returns an ISO date string on success, or null on failure/timeout.
 */
const JPOST_FUTURE_TOLERANCE_MS = 30 * 60 * 1000; // 30 minutes — tolerance after TZ correction

async function fetchRealPublishDate(url) {
  const controller = new AbortController();
  // Use a tight per-article timeout — we fire these in parallel for all future-dated articles
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.jpost.com/'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    const nowMs = Date.now();
    const acceptableMs = nowMs + JPOST_FUTURE_TOLERANCE_MS;

    // Helper: validate a candidate date string — accepts past dates and dates
    // within the tolerance window (CMS clock skew). Clamps slightly-future
    // dates to now so downstream sorting looks correct.
    const validateDate = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      if (d.getTime() > acceptableMs) return null; // truly future — not yet live
      // If within tolerance window but technically future, clamp to now
      // so it shows as "just published" rather than a future timestamp.
      if (d.getTime() > nowMs) return new Date(nowMs).toISOString();
      return d.toISOString();
    };

    // ── Strategy 1: Classic <script type="application/ld+json"> ───────────────
    // JPost serves a proper NewsArticle LD+JSON block with datePublished.
    const jsonLdMatches = html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const schema = JSON.parse(match[1]);
        const candidates = Array.isArray(schema) ? schema : [schema];
        for (const obj of candidates) {
          if (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article') {
            const validated = validateDate(obj.datePublished);
            if (validated) return validated;
          }
        }
        // Second pass: accept any object with datePublished (may not have @type)
        for (const obj of candidates) {
          const validated = validateDate(obj.datePublished);
          if (validated) return validated;
        }
      } catch (_) {
        // malformed JSON-LD — try next
      }
    }

    // ── Strategy 2: Raw "datePublished":"..." anywhere in the page ────────────
    // JPost's Next.js RSC payload embeds date fields as plain JSON key-value
    // pairs inside __next_f.push() script blocks. Simple regex finds them even
    // when they're not inside a parseable JSON-LD block.
    const rawDatePublished = html.match(/"datePublished":"([^"]+)"/);
    if (rawDatePublished) {
      const validated = validateDate(rawDatePublished[1]);
      if (validated) return validated;
    }

    // ── Strategy 3: <time datetime="..."> element ─────────────────────────────
    // JPost renders a <time> element in the article header.
    const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["']/);
    if (timeMatch) {
      const validated = validateDate(timeMatch[1]);
      if (validated) return validated;
    }

    // ── Strategy 4: OpenGraph <meta property="article:published_time"> ─────────
    const ogMatch = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)
                 || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i);
    if (ogMatch) {
      const validated = validateDate(ogMatch[1]);
      if (validated) return validated;
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

      // --- CNN section-link filter ---
      // CNN injects nav/section links into their RSS (e.g. title="Iran", link=cnn.com/specials/...)
      // with no description and no pubDate. These are useless category pages, not articles.
      // We drop any item whose link contains "/specials/" OR has no description AND a
      // single-word title (which would otherwise show up as "Iran", "Israel", "Syria").
      if (feed.cnnTitleFix) {
        const beforeCount = items.length;
        items = items.filter(item => {
          const link = item.link || '';
          if (link.includes('/specials/')) return false;
          // Also drop bare section names with no description
          const title = (item.title || '').trim();
          const hasDesc = !!(item.contentSnippet || item.content || item.description);
          if (!hasDesc && title.split(' ').length <= 3 && !/\d/.test(title)) return false;
          return true;
        });
        const dropped = beforeCount - items.length;
        if (dropped > 0) {
          console.log(`  🧹 ${feed.name}: dropped ${dropped} section nav link(s)`);
        }
      }

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
            // dropNoDate: true — drop items with no pubDate instead of letting them bypass
            // the stale filter. CNN uses this because their feed omits <pubDate> on all
            // items (frozen since 2024), so without this flag they would all slip through.
            if (feed.dropNoDate) {
              return false;
            }
            item._noDate = true;
            return true;
          }
          const articleDate = new Date(dateStr);
          if (isNaN(articleDate.getTime())) {
            if (feed.dropNoDate) {
              return false;
            }
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

      // --- JPost timezone correction ---
      // ROOT CAUSE (confirmed forensically): JPost's RSS feed stamps all pubDate
      // values in Israel local time (IDT = UTC+3 in summer, IST = UTC+2 in winter)
      // but labels them as "GMT". This makes articles appear 2–3 hours in the future.
      //
      // FIX: Apply correctJPostTimezone() to every JPost item. This subtracts the
      // Israel offset (determined via Intl API for DST accuracy) from the mislabeled
      // timestamp to produce the true UTC publish time. No scraping needed.
      if (feed.fixFutureDates) {
        const nowMs = Date.now();
        for (const item of items) {
          const rawDate = item.isoDate || item.pubDate;
          if (!rawDate) continue;
          const corrected = correctJPostTimezone(rawDate);
          if (corrected) {
            const origD = new Date(rawDate);
            const corrD = new Date(corrected);
            const offsetMin = Math.round((origD - corrD) / 60000);
            item._correctedDate = corrected;
            if (Math.abs(offsetMin) > 1) {
              const agoMin = Math.round((nowMs - corrD.getTime()) / 60000);
              console.log(`  🕐 ${feed.name}: TZ-fixed "${(item.title||'').slice(0,50)}" −${offsetMin}min → ${corrected} (${agoMin >= 0 ? agoMin + 'min ago' : 'future by ' + Math.abs(agoMin) + 'min'})`);
            }
          }
        }
      }

      const purgeUrls = []; // No articles dropped — timezone correction handles all cases

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
            // pubDate is in the future after literal parsing
            if (item._correctedDate) {
              // Use the timezone-corrected date (correctJPostTimezone already ran)
              parsedDate = item._correctedDate;
            } else {
              // Non-JPost feed with unexpected future date — clamp to now
              parsedDate = new Date().toISOString();
              console.log(`  ⏰ Future pubDate clamped to now for: ${item.title ? item.title.slice(0, 60) : 'unknown'}`);
            }
          } else {
            // Normal past date — prefer timezone-corrected value if available
            // (for JPost items that parsed as past but still had mislabeled TZ),
            // otherwise normalise to strict ISO UTC string.
            parsedDate = item._correctedDate || d.toISOString();
          }
        }

        // --- CNN title fix ---
        // CNN's RSS feed has two classes of bad titles:
        //   1. Section navigation links: single-word generic country/topic names
        //      ("Iran", "Israel", "Syria") pointing to /specials/ pages with no description.
        //      These are filtered out by filterCnnSectionLinks below.
        //   2. Live-blog date labels: "June 17, 2024 - Israel-Gaza news" — the date slug
        //      is the <title>, but the actual lead sentence is in <description>.
        // When cnnTitleFix is set, we replace the title with the description text for
        // any item whose <title> looks like a date label or a bare section name.
        let resolvedTitle = item.title || 'Untitled';
        if (feed.cnnTitleFix) {
          const raw = resolvedTitle.trim();
          // Pattern 1: title is just a short section/country name (1-3 words, no verb)
          const isSectionName = /^[A-Z][a-zA-Z\s]{0,30}$/.test(raw) && raw.split(' ').length <= 3
            && !raw.includes(',') && !raw.includes('-');
          // Pattern 2: title starts with a month name or date stamp
          const isDateLabel = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(raw)
            || /^\w+ \d+,? \d{4}/.test(raw);
          if ((isSectionName || isDateLabel) && item.contentSnippet) {
            // Use the first sentence of the description as a more informative headline.
            // contentSnippet is the HTML-stripped version of <description>.
            const descLines = item.contentSnippet.trim().split(/\n+/);
            const firstMeaningfulLine = descLines.find(l => l.trim().length > 20) || descLines[0];
            if (firstMeaningfulLine && firstMeaningfulLine.trim().length > 10) {
              resolvedTitle = firstMeaningfulLine.trim();
            }
          }
        }

        return {
          title: cleanTitle(resolvedTitle),
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

      return { feed, articles, purgeUrls };
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
  const allPurgeUrls = []; // URLs to remove from the persistent daily archive
  const sourceStats = [];

  // Add disabled feeds to stats as permanently skipped
  for (const feed of skippedFeeds) {
    sourceStats.push({ name: feed.name, logo: feed.emoji, count: 0, disabled: true });
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feed = activeFeeds[i];

    if (result.status === 'fulfilled') {
      const { articles, purgeUrls } = result.value;
      allArticles.push(...articles);
      if (purgeUrls && purgeUrls.length > 0) allPurgeUrls.push(...purgeUrls);
      sourceStats.push({ name: feed.name, logo: feed.emoji, count: articles.length });
      console.log(`  ✓ ${feed.name}: ${articles.length} articles`);
    } else {
      console.error(`  ✗ ${feed.name}: ${result.reason.message}`);
      sourceStats.push({ name: feed.name, logo: feed.emoji, count: 0, error: true });
    }
  }

  // Sort by date, newest first
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { articles: allArticles, sourceStats, purgeUrls: allPurgeUrls };
}

module.exports = { fetchAllFeeds };

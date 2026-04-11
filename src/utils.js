// ===== SHARED UTILITIES =====
// Single definitions for functions used across modules (Item #8, #9).

const fs = require('fs');

/**
 * Escape HTML special characters (single canonical implementation).
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize HTML — whitelist safe tags from Gemini output.
 */
function sanitizeHTML(html) {
  if (!html) return '';
  // Remove event attributes
  let clean = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*\S+/gi, '');
  // Remove style attributes
  clean = clean.replace(/\s+style\s*=\s*["'][^"']*["']/gi, '');
  // Whitelist: only allow specific safe tags
  clean = clean.replace(/<\/?(?!(?:strong|em|p|br|ul|li|h3|h4)\b)[a-z][a-z0-9]*\b[^>]*>/gi, '');
  return clean;
}

/**
 * Server-side timeAgo (kept for static HTML generation at build time).
 * Client-side `computeTimeAgo` in index.astro inline script handles live re-computation.
 *
 * Guards against future timestamps (e.g. JPost pre-schedules articles with future
 * pubDates in their RSS). A future timestamp produces a negative diffMs, causing
 * diffMins < 1 to be true and returning 'just now' even for articles published hours
 * ago. We clamp negative diffs to 0 so future-dated articles show 'just now' rather
 * than displaying a nonsensical negative age.
 */
function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const rawDiffMs = now - date;
  // Clamp to 0: a future date means the article is at most 'just published'
  const diffMs = Math.max(0, rawDiffMs);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Decode HTML entities from a string.
 * Handles both named entities (&amp; &quot; &lt; &gt; &apos; &nbsp; &mdash; &ndash; etc.)
 * and numeric entities (&#39; &#x27; &#8212; etc.).
 * Uses a lookup table for the most common named entities found in RSS feeds,
 * then falls back to a DOM-style decode trick for anything else.
 */
function decodeHtmlEntities(str) {
  if (!str || !str.includes('&')) return str;

  // Named entity map — covers every entity commonly found in news RSS feeds
  const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0',
    mdash: '\u2014', ndash: '\u2013', lsquo: '\u2018', rsquo: '\u2019',
    ldquo: '\u201C', rdquo: '\u201D', hellip: '\u2026', bull: '\u2022',
    copy: '\u00A9', reg: '\u00AE', trade: '\u2122', euro: '\u20AC',
    pound: '\u00A3', yen: '\u00A5', cent: '\u00A2', deg: '\u00B0',
    frac12: '\u00BD', frac14: '\u00BC', frac34: '\u00BE',
    times: '\u00D7', divide: '\u00F7', plusmn: '\u00B1',
    // Hebrew-related
    lrm: '\u200E', rlm: '\u200F',
  };

  // Decode once. We apply it twice to handle double-encoded entities
  // (e.g. &amp;quot; → &quot; → "), which appear in some RSS feeds that
  // have been processed by intermediate HTML renderers.
  function decodeOnce(s) {
    return s.replace(/&(#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g, (match, ref) => {
      if (ref.startsWith('#x')) {
        return String.fromCodePoint(parseInt(ref.slice(2), 16));
      } else if (ref.startsWith('#')) {
        return String.fromCodePoint(parseInt(ref.slice(1), 10));
      } else {
        return NAMED[ref.toLowerCase()] || match;
      }
    });
  }

  // Apply twice to unwrap double-encoded entities (&amp;quot; → &quot; → ")
  let decoded = decodeOnce(str);
  if (decoded !== str) decoded = decodeOnce(decoded);
  return decoded;
}

/**
 * Clean a headline/title: decode HTML entities, strip any residual HTML tags,
 * normalize whitespace.
 */
function cleanTitle(text) {
  if (!text) return '';
  return decodeHtmlEntities(text)
    .replace(/<[^>]+>/g, '')   // strip any HTML tags (rare but possible)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip HTML tags, decode HTML entities, and normalize whitespace from a snippet.
 * Replaces the old version that used a naive &[a-z]+; regex which:
 *   - silently dropped & from text like "killed & wounded" (stripping the &amp;)
 *   - left &#39; apostrophes undecoded
 *   - left &mdash; &ndash; etc. as spaces instead of proper chars
 */
function cleanSnippet(text, maxLength) {
  if (!text) return '';
  return decodeHtmlEntities(
    text.replace(/<[^>]+>/g, '') // strip HTML tags first, then decode entities
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Truncate text to a length, breaking at word boundary.
 */
function truncateSnippet(text, len) {
  if (!text || text.length <= len) return text;
  return text.slice(0, len).replace(/\s+\S*$/, '') + '…';
}

/**
 * Filter RSS items by keyword list.
 */
function filterByKeywords(items, keywords) {
  if (!keywords) return items;
  return items.filter(item => {
    const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

/**
 * Atomic file write — write to temp file, then rename (Item #9).
 * Prevents partial reads if the process crashes mid-write.
 */
function atomicWriteSync(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * Sleep helper for retry delays.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  escapeHtml,
  sanitizeHTML,
  timeAgo,
  decodeHtmlEntities,
  cleanTitle,
  cleanSnippet,
  truncateSnippet,
  filterByKeywords,
  atomicWriteSync,
  sleep
};

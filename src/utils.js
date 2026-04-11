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
 */
function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
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
 * Strip HTML tags and normalize whitespace from a snippet.
 */
function cleanSnippet(text, maxLength) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
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
  cleanSnippet,
  truncateSnippet,
  filterByKeywords,
  atomicWriteSync,
  sleep
};

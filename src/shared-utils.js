// ===== SHARED UTILITIES (ESM) =====
// ESM versions of utility functions for use in Astro components.
// The CJS versions in src/utils.js remain for Node scripts (fetch.js, synthesizer.js, etc.).

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str) {
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
export function sanitizeHTML(html) {
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
 * Compute relative time string from a date.
 */
export function timeAgo(dateStr) {
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
 * Truncate text to a length, breaking at word boundary.
 */
export function truncateSnippet(text, len) {
  if (!text || text.length <= len) return text;
  return text.slice(0, len).replace(/\s+\S*$/, '') + '…';
}

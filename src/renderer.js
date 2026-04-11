// ===== HTML GENERATION =====
// Reads the template and injects data via simple string replacement.

const fs = require('fs');
const path = require('path');
const { FEEDS, SNIPPET_LENGTH, TIMEZONE, getFaviconUrl } = require('./config');
const { escapeHtml, sanitizeHTML, timeAgo, truncateSnippet } = require('./utils');

const TEMPLATE_PATH = path.join(__dirname, '..', 'public', 'template.html');

/**
 * Generate article card HTML.
 */
function renderArticleCards(articles, situationReportData) {
  // Build urgency badge keywords from sitrep top updates
  const topHeadlineKeywords = (situationReportData && situationReportData.top_updates || []).map(u => {
    return (u.headline || '').toLowerCase().split(/\s+/).filter(w =>
      w.length >= 4 && !['that','this','with','from','they','have','been','more','also','into','than','said'].includes(w)
    );
  });

  function isTopStory(title) {
    const titleLower = (title || '').toLowerCase();
    for (const keywords of topHeadlineKeywords) {
      if (keywords.length === 0) continue;
      const matches = keywords.filter(kw => titleLower.includes(kw));
      if (matches.length >= 2) return true;
    }
    return false;
  }

  return articles.map((a, idx) => {
    const ago = timeAgo(a.date);
    const shortSnippet = escapeHtml(truncateSnippet(a.snippet, SNIPPET_LENGTH));
    const fullSnippet = escapeHtml(a.snippet);
    const hasMore = a.snippet && a.snippet.length > SNIPPET_LENGTH;
    const topStory = isTopStory(a.title);
    const noDateFlag = a.noDate ? ' data-no-date="true"' : '';

    return `
      <div class="card" data-source="${escapeHtml(a.source)}" data-date="${a.date}" data-idx="${idx}"${noDateFlag} onclick="toggleCard(this, event)">
        <div class="card-inner">
          <div class="card-avatar">
            <img src="${a.publisherLogo}" alt="${escapeHtml(a.source)}" class="publisher-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="publisher-logo-fallback" style="display:none; background:${a.color}">${a.logo}</span>
          </div>
          <div class="card-body">
            <div class="card-header">
              <div class="card-source-row">
                <span class="source-name" style="color: ${a.color}">${escapeHtml(a.source)}</span>
                <span class="dot-sep">·</span>
                <span class="time-ago" data-date="${a.date}">${ago}</span>
                ${topStory ? '<span class="urgency-badge">⚡ Top Story</span>' : ''}
              </div>
            </div>
            <h3 class="card-title">${escapeHtml(a.title)}</h3>
            ${a.snippet ? `
              <p class="card-snippet card-snippet-short">${shortSnippet}</p>
              ${hasMore ? `<p class="card-snippet card-snippet-full">${fullSnippet}</p>` : ''}
            ` : ''}
            <div class="card-actions">
              ${hasMore ? '<button class="expand-btn" onclick="toggleCard(this.closest(\'.card\'), event); event.stopPropagation();">Read more</button>' : ''}
              <a href="${a.link}" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation();">
                Open article ↗
              </a>
              <button class="share-btn" data-title="${escapeHtml(a.title)}" data-url="${escapeHtml(a.link)}" onclick="shareArticle(event)" title="Share">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('\n');
}

/**
 * Render the situation report section, or the unavailable banner (Item #3).
 */
function renderSitrep(situationReportData) {
  if (!situationReportData) {
    return `
    <div class="sitrep-unavailable">
      <span class="sitrep-unavailable-icon">⚠️</span>
      <span>AI synthesis unavailable — showing articles only. The briefing will return on the next successful update.</span>
    </div>`;
  }

  return `
    <div class="sitrep-card">
      <div class="sitrep-label">SITUATION REPORT</div>
      <div class="sitrep-summary">${sanitizeHTML(situationReportData.summary)}</div>
      <div class="sitrep-top-updates">
        ${(situationReportData.top_updates || []).map(u => `
          <div class="sitrep-update-card">
            <span class="sitrep-update-headline">${escapeHtml(u.headline)}</span>
            <span class="sitrep-update-meta">${escapeHtml(u.source)} · ${escapeHtml(u.time)}</span>
          </div>
        `).join('')}
      </div>
      <button class="sitrep-expand-btn" onclick="this.classList.toggle('open'); document.getElementById('sitrepDetail').classList.toggle('open')">
        <span class="sitrep-expand-label">See full briefing</span>
        <span class="sitrep-expand-chevron">›</span>
      </button>
      <div class="sitrep-detail" id="sitrepDetail">
        <p>${sanitizeHTML(situationReportData.detailed_analysis || '')}</p>
      </div>
      <p class="sitrep-footer">AI-synthesized briefing · All sources</p>
    </div>`;
}

/**
 * Render source filter buttons.
 */
function renderFilterButtons(articles) {
  const sources = [...new Set(articles.map(a => a.source))];
  // Build shortName and favicon lookup from FEEDS config
  const feedMap = {};
  for (const f of FEEDS) {
    feedMap[f.name] = f;
  }

  return sources.map(s => {
    const feed = feedMap[s];
    const shortName = feed ? feed.shortName : s;
    const logoUrl = feed ? getFaviconUrl(feed.faviconDomain) : '';
    const logoImg = logoUrl ? `<img src="${logoUrl}" class="filter-logo" alt="">` : '';
    return `<button class="filter-btn" onclick="filterSource('${s}')">${logoImg} ${escapeHtml(shortName)}</button>`;
  }).join('\n      ');
}

/**
 * Generate the full HTML page by reading the template and replacing placeholders.
 */
function generateHTML(articles, sourceStats, situationReportData) {
  const now = new Date();
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const articleCards = renderArticleCards(articles, situationReportData);
  const sitrepHTML = renderSitrep(situationReportData);
  const filtersHTML = renderFilterButtons(articles);
  const articleCount = `${articles.length} articles · ${sourceStats.filter(s => !s.error).length} sources`;

  let html = template;
  html = html.replace('{{GENERATED_AT}}', now.toISOString());
  html = html.replace('{{SITREP}}', sitrepHTML);
  html = html.replace('{{ARTICLE_COUNT}}', articleCount);
  html = html.replace('{{FILTERS}}', filtersHTML);
  html = html.replace('{{ARTICLES}}', articleCards);

  return html;
}

module.exports = { generateHTML };

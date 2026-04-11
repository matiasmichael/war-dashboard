const fs = require('fs');
const path = require('path');
const RssParser = require('rss-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ===== DELTA FRAMING: Load previous sitrep for comparison =====
function loadPreviousSitrep() {
  const sitrepPath = path.join(__dirname, 'data', 'last-sitrep.json');
  try {
    if (fs.existsSync(sitrepPath)) {
      const data = JSON.parse(fs.readFileSync(sitrepPath, 'utf-8'));
      console.log('📋 Loaded previous sitrep for delta framing');
      return data;
    }
  } catch (e) {
    console.warn('Could not load previous sitrep:', e.message);
  }
  return null;
}

function saveSitrep(sitrep) {
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const sitrepPath = path.join(dataDir, 'last-sitrep.json');
  fs.writeFileSync(sitrepPath, JSON.stringify({ ...sitrep, generatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  console.log('💾 Saved current sitrep for next delta comparison');
}

async function synthesizeReport(articles) {
  try {
    console.log("Synthesizing Situation Report with Gemini...");
    
    // Read openclaw config to extract the Gemini API key
    const openclawConfigStr = fs.readFileSync(path.join(process.env.HOME, '.openclaw/openclaw.json'), 'utf-8');
    const openclawConfig = JSON.parse(openclawConfigStr);
    const googleKey = openclawConfig.env.GOOGLE_API_KEY;
    
    if (!googleKey) {
      console.warn("No GOOGLE_API_KEY found. Skipping synthesis.");
      return null;
    }

    const genAI = new GoogleGenerativeAI(googleKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const recentArticles = articles.slice(0, 25);
    const feedContext = recentArticles.map(a => `[${a.source}] ${a.title}\n${a.contentSnippet || a.content || ''}\nPublished: ${a.date || 'unknown'}`).join("\n\n");

    // Delta framing: load previous sitrep
    const previousSitrep = loadPreviousSitrep();
    const deltaContext = previousSitrep ? `

PREVIOUS BRIEFING (generated at ${previousSitrep.generatedAt || 'unknown'}):
Summary: ${previousSitrep.summary || 'N/A'}
Top Updates: ${(previousSitrep.top_updates || []).map(u => u.headline).join('; ')}
Analysis: ${previousSitrep.detailed_analysis || 'N/A'}

IMPORTANT: Frame your summary and analysis as "what changed since the last update". Highlight new developments, shifts, and escalations compared to the previous briefing. Use phrases like "Since the last update...", "New development:", "Escalation:", etc.` : '';

    const prompt = `You are a senior intelligence briefer specializing in the Iran-Israel conflict. Analyze the following 25 latest headlines and produce a structured JSON briefing focused on the Iran-Israel war, including Iranian proxies (Hezbollah, Hamas, Houthis), direct Iran-Israel military exchanges, nuclear developments, and regional escalation.

Headlines:
${feedContext}${deltaContext}

Return ONLY valid JSON (no markdown fences, no commentary) with this exact structure:
{
  "summary": "2 sentences MAXIMUM. Hard limit: 40 words. Use <strong> tags to bold the 2-3 most important terms only. Plain text otherwise. No HTML except <strong>. Be ruthless — cut every unnecessary word. Focus on Iran-Israel conflict dynamics.",
  "top_updates": [
    { "headline": "Short punchy headline (max 12 words)", "source": "Source Name", "time": "e.g. 2h ago" },
    { "headline": "...", "source": "...", "time": "..." },
    { "headline": "...", "source": "...", "time": "..." }
  ],
  "detailed_analysis": "A longer 3-5 sentence analysis covering Iran-Israel tensions, proxy conflicts, nuclear dimensions, open questions, and what to watch. Use <strong> for key terms. This will be hidden by default behind a toggle."
}

RULES:
- summary must be 2 sentences, MAX 40 words total. Count them. If over 40, cut words until under.
- top_updates: pick the 3 MOST important/impactful stories related to the Iran-Israel conflict. Headline must be punchy and short.
- For "time" field, use relative time (e.g. "1h ago", "3h ago", "just now") based on the published dates.
- detailed_analysis: cover Iran-Israel tensions, proxy warfare, nuclear dimensions, and what to watch next. Max 80 words.
- Prioritize stories about Iran, Israel, Hezbollah, Hamas, Houthis, IRGC, nuclear program, and direct confrontation.
- Tone: objective, analytical, no sensationalism.
- Output ONLY the JSON object, nothing else.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let textOutput = response.text();
    
    // Clean up markdown wrappers
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Parse JSON
    const parsed = JSON.parse(textOutput);

    // Save sitrep for next delta comparison
    saveSitrep(parsed);

    return parsed;

  } catch (err) {
    console.error("Failed to generate Situation Report:", err);
    return null;
  }
}


const parser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  }
});

// Publisher logo URLs — Google's favicon service (128px, reliable & high quality)
const PUBLISHER_LOGOS = {
  'Ynet News': 'https://www.google.com/s2/favicons?domain=ynet.co.il&sz=128',
  'Haaretz': 'https://www.google.com/s2/favicons?domain=haaretz.com&sz=128',
  'CNN': 'https://www.google.com/s2/favicons?domain=cnn.com&sz=128',
  'Fox News': 'https://www.google.com/s2/favicons?domain=foxnews.com&sz=128',
  'BBC News': 'https://www.google.com/s2/favicons?domain=bbc.com&sz=128',
  'Al Jazeera': 'https://www.google.com/s2/favicons?domain=aljazeera.com&sz=128',
  'NPR': 'https://www.google.com/s2/favicons?domain=npr.org&sz=128',
  'Times of Israel': 'https://www.google.com/s2/favicons?domain=timesofisrael.com&sz=128',
  'Jerusalem Post': 'https://www.google.com/s2/favicons?domain=jpost.com&sz=128'
};

// RSS feeds from major news sources — war/Middle East focused where possible
const FEEDS = [
  {
    name: 'Ynet News',
    url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml',
    logo: '🇮🇱',
    color: '#e74c3c',
    accentLight: '#fef2f2',
    keywords: null
  },
  {
    name: 'Haaretz',
    url: 'https://www.haaretz.com/cmlink/1.4478498',
    logo: '📰',
    color: '#006400',
    accentLight: '#f0fdf4',
    keywords: null
  },
  {
    name: 'CNN',
    url: 'http://rss.cnn.com/rss/edition_meast.rss',
    logo: '📺',
    color: '#cc0000',
    accentLight: '#fef2f2',
    keywords: null
  },
  {
    name: 'Fox News',
    url: 'https://moxie.foxnews.com/google-publisher/world.xml',
    logo: '🦊',
    color: '#003366',
    accentLight: '#eff6ff',
    keywords: ['israel', 'gaza', 'hamas', 'hezbollah', 'iran', 'lebanon', 'middle east', 'idf', 'hostage', 'ceasefire', 'netanyahu', 'palestinian', 'west bank', 'tel aviv', 'jerusalem', 'beirut', 'tehran', 'houthi', 'yemen', 'syria', 'war']
  },
  {
    name: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
    logo: '🇬🇧',
    color: '#b80000',
    accentLight: '#fef2f2',
    keywords: null
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    logo: '🌍',
    color: '#c68e17',
    accentLight: '#fefce8',
    keywords: ['israel', 'gaza', 'hamas', 'hezbollah', 'iran', 'lebanon', 'middle east', 'idf', 'hostage', 'ceasefire', 'netanyahu', 'palestinian', 'west bank', 'war', 'beirut', 'houthi', 'yemen', 'syria']
  },
  {
    name: 'NPR',
    url: 'https://feeds.npr.org/1004/rss.xml',
    logo: '🎙️',
    color: '#2880b9',
    accentLight: '#eff6ff',
    keywords: ['israel', 'gaza', 'hamas', 'hezbollah', 'iran', 'lebanon', 'middle east', 'idf', 'hostage', 'ceasefire', 'netanyahu', 'palestinian', 'west bank', 'war', 'beirut', 'houthi', 'yemen', 'syria']
  },
  {
    name: 'Times of Israel',
    url: 'https://www.timesofisrael.com/feed/',
    logo: '🕎',
    color: '#1a5276',
    accentLight: '#eff6ff',
    keywords: null
  },
  {
    name: 'Jerusalem Post',
    url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx',
    logo: '📜',
    color: '#2c3e50',
    accentLight: '#f8fafc',
    keywords: null
  }
];

function filterByKeywords(items, keywords) {
  if (!keywords) return items;
  return items.filter(item => {
    const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

function cleanSnippet(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

function truncateSnippet(text, len) {
  if (!text || text.length <= len) return text;
  return text.slice(0, len).replace(/\s+\S*$/, '') + '…';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

async function fetchAllFeeds() {
  const allArticles = [];
  const sourceStats = [];

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching: ${feed.name}...`);
      const result = await parser.parseURL(feed.url);
      let items = result.items || [];
      items = filterByKeywords(items, feed.keywords);

      // Take top 15 per source
      items = items.slice(0, 15);

      // CNN stale article filter: exclude articles older than 48 hours
      const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;
      const nowMs = Date.now();
      if (feed.name === 'CNN') {
        const beforeCount = items.length;
        items = items.filter(item => {
          const dateStr = item.isoDate || item.pubDate;
          if (!dateStr) {
            // No valid date — keep but will be flagged
            item._noDate = true;
            return true;
          }
          const articleDate = new Date(dateStr);
          if (isNaN(articleDate.getTime())) {
            item._noDate = true;
            return true;
          }
          return (nowMs - articleDate.getTime()) < STALE_THRESHOLD_MS;
        });
        const removed = beforeCount - items.length;
        if (removed > 0) {
          console.log(`  🗑️  CNN: filtered ${removed} stale articles (>48h old)`);
        }
      }

      const articles = items.map(item => ({
        title: item.title || 'Untitled',
        link: item.link || '#',
        snippet: cleanSnippet(item.contentSnippet || item.content || ''),
        date: item.isoDate || item.pubDate || new Date().toISOString(),
        source: feed.name,
        logo: feed.logo,
        color: feed.color,
        accentLight: feed.accentLight,
        publisherLogo: PUBLISHER_LOGOS[feed.name] || '',
        noDate: item._noDate || false
      }));

      allArticles.push(...articles);
      sourceStats.push({ name: feed.name, logo: feed.logo, count: articles.length });
      console.log(`  ✓ ${feed.name}: ${articles.length} articles`);
    } catch (err) {
      console.error(`  ✗ ${feed.name}: ${err.message}`);
      sourceStats.push({ name: feed.name, logo: feed.logo, count: 0, error: true });
    }
  }

  // Sort by date, newest first
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { articles: allArticles, sourceStats };
}

// Israel timezone constant
const ISRAEL_TZ = 'Asia/Jerusalem';

// ===== HTML SANITIZER: whitelist safe tags from Gemini output =====
function sanitizeHTML(html) {
  if (!html) return '';
  // Remove event attributes (onclick, onerror, onload, etc.)
  let clean = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*\S+/gi, '');
  // Remove style attributes
  clean = clean.replace(/\s+style\s*=\s*["'][^"']*["']/gi, '');
  // Whitelist approach: only allow specific safe tags
  // Remove all tags except whitelisted ones
  clean = clean.replace(/<\/?(?!(?:strong|em|p|br|ul|li|h3|h4)\b)[a-z][a-z0-9]*\b[^>]*>/gi, '');
  return clean;
}

function generateHTML(articles, sourceStats, situationReportData) {
  const now = new Date();
  const updatedAt = now.toLocaleString('en-US', {
    timeZone: ISRAEL_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  // Build urgency badge keywords from sitrep top updates
  const topHeadlineKeywords = (situationReportData && situationReportData.top_updates || []).map(u => {
    // Extract significant words (4+ chars) from each headline for fuzzy matching
    return (u.headline || '').toLowerCase().split(/\s+/).filter(w => w.length >= 4 && !['that','this','with','from','they','have','been','more','also','into','than','said'].includes(w));
  });

  function isTopStory(title) {
    const titleLower = (title || '').toLowerCase();
    for (const keywords of topHeadlineKeywords) {
      if (keywords.length === 0) continue;
      // Match if at least 2 significant keywords from a top headline appear in the article title
      const matches = keywords.filter(kw => titleLower.includes(kw));
      if (matches.length >= 2) return true;
    }
    return false;
  }

  const articleCards = articles.map((a, idx) => {
    const ago = timeAgo(a.date);
    const shortSnippet = escapeHtml(truncateSnippet(a.snippet, 120));
    const fullSnippet = escapeHtml(a.snippet);
    const hasMore = a.snippet && a.snippet.length > 120;
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

  // Short name map for filter pills
  const SHORT_NAMES = {
    'Jerusalem Post': 'J. Post',
    'Times of Israel': 'ToI',
    'Al Jazeera': 'Al Jaz',
    'Fox News': 'Fox',
    'BBC News': 'BBC',
    'Ynet News': 'Ynet',
    'Haaretz': 'Haaretz',
    'CNN': 'CNN',
    'NPR': 'NPR'
  };

  // Compute "time ago" for header
  const headerTimeAgo = timeAgo(now.toISOString());
  // More useful: time of most recent article
  const newestDate = articles.length > 0 ? articles[0].date : now.toISOString();
  const lastUpdateAgo = timeAgo(newestDate);

  const statsHTML = sourceStats.map(s =>
    `<span class="stat-item ${s.error ? 'stat-error' : ''}">${s.logo} ${s.name}: ${s.count}${s.error ? ' ⚠' : ''}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Iran War Update — Live News Dashboard</title>
  <meta name="description" content="Up-to-date Iran-Israel conflict news and intelligence briefings from leading sources">
  <meta name="data-generated-at" content="${now.toISOString()}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔶</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #FAF8F5;
      --surface: #ffffff;
      --surface-hover: #F5F2EE;
      --border: #E8E4DF;
      --border-light: #F0ECE7;
      --text: #1E1B18;
      --text-secondary: #2C2824;
      --text-muted: #7A746D;
      --accent: #E8732C;
      --accent-gold: #F5C542;
      --accent-soft: #FFF3EB;
      --shadow-sm: 0 1px 2px rgba(30,27,24,0.04);
      --shadow-md: 0 2px 8px rgba(30,27,24,0.06);
      --shadow-lg: 0 4px 16px rgba(30,27,24,0.08);
      --radius: 12px;
      --radius-sm: 8px;
    }

    body {
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ===== HEADER ===== */
    .header {
      background: var(--text);
      border-bottom: none;
      padding: 0;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header-inner {
      max-width: 680px;
      margin: 0 auto;
    }

    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 1.25rem 0.55rem;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .header h1 {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: #fff;
      margin: 0;
    }

    .header-time {
      font-size: 0.7rem;
      font-weight: 400;
      color: rgba(255,255,255,0.5);
      display: block;
      margin-top: 0.1rem;
    }

    .header-archive-link {
      font-size: 0.75rem;
      color: rgba(255,255,255,0.6);
      text-decoration: none;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      transition: color 0.15s;
      padding: 0.35rem 0.65rem;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
    }

    .header-archive-link:hover {
      color: #fff;
      background: rgba(255,255,255,0.14);
    }

    .header-accent-bar {
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent-gold));
    }

    .live-dot {
      width: 7px;
      height: 7px;
      background: var(--accent);
      border-radius: 50%;
      display: inline-block;
      animation: pulse 2s infinite;
      flex-shrink: 0;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(232,115,44,0.5); }
      50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(232,115,44,0); }
    }

    @keyframes pulse-slow {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(232,115,44,0.3); }
      50% { opacity: 0.5; box-shadow: 0 0 0 4px rgba(232,115,44,0); }
    }

    .live-dot.fresh { animation: pulse 2s infinite; background: var(--accent); }
    .live-dot.recent { animation: pulse-slow 3s infinite; background: var(--accent); }
    .live-dot.stale { animation: none; background: #999; opacity: 0.5; }

    .header-freshness {
      font-size: 0.7rem;
      font-weight: 400;
      color: rgba(255,255,255,0.55);
      margin-left: 0.4rem;
    }

    /* ===== ARTICLES SECTION DIVIDER ===== */
    .articles-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 0 0.35rem;
      margin-bottom: 0;
    }

    .articles-section-label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    /* ===== URGENCY BADGE ===== */
    .urgency-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.1rem 0.45rem;
      background: linear-gradient(135deg, #F5A623, #F7C948);
      color: #7C4A00;
      font-size: 0.65rem;
      font-weight: 700;
      border-radius: 10px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin-left: 0.3rem;
      white-space: nowrap;
    }

    /* ===== SITREP LABEL ===== */
    .sitrep-label {
      display: inline-block;
      padding: 0.3rem 0.75rem;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      background: var(--accent-soft);
      border-radius: 0 0 8px 0;
    }

    /* ===== SHARE BUTTON ===== */
    .share-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      padding: 0.3rem;
      border-radius: 6px;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: auto;
    }
    .share-btn:hover { color: var(--accent); background: var(--accent-soft); }
    .share-btn.copied { color: #16a34a; }

    /* ===== TIME FILTER BUTTONS ===== */
    .time-filter-btn {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--accent);
      border-radius: 20px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .time-filter-btn:hover {
      background: var(--accent);
      color: #fff;
    }
    .time-filter-btn.active {
      background: var(--accent);
      color: #fff;
    }
    .time-filter-sep {
      width: 1px;
      height: 20px;
      background: var(--border);
      flex-shrink: 0;
      margin: 0 0.15rem;
    }

    /* ===== BACK TO TOP BUTTON ===== */
    .back-to-top {
      position: fixed;
      bottom: 2rem;
      right: 1.25rem;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      border: none;
      font-size: 1.3rem;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(232,115,44,0.35);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 90;
      transition: opacity 0.2s, transform 0.2s;
    }
    .back-to-top.visible {
      display: flex;
    }
    .back-to-top:hover {
      transform: scale(1.08);
    }

    /* ===== UPDATE TOAST ===== */
    .update-toast {
      position: fixed;
      top: 70px;
      left: 50%;
      transform: translateX(-50%) translateY(-120%);
      background: var(--text);
      color: #fff;
      padding: 0.6rem 1.2rem;
      border-radius: 24px;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      z-index: 110;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      transition: transform 0.3s ease;
      white-space: nowrap;
    }
    .update-toast.visible {
      transform: translateX(-50%) translateY(0);
    }

    /* ===== FILTER BAR ===== */
    .filter-bar {
      display: flex;
      flex-wrap: nowrap;
      gap: 0.4rem;
      padding: 0.35rem 0;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .filter-bar::-webkit-scrollbar { display: none; }

    .filter-btn {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 20px;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    .filter-logo {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      object-fit: cover;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .filter-btn:hover {
      background: var(--border-light);
      border-color: var(--accent-gold);
      color: var(--text-secondary);
    }

    .filter-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    /* ===== CONTAINER ===== */
    .container {
      max-width: 680px;
      margin: 0 auto;
      padding: 0.5rem 1rem 3rem;
    }

    .article-count {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8rem;
      margin-bottom: 0.5rem;
      font-weight: 400;
    }

    /* ===== CARD / DIGEST ITEM ===== */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem 1.15rem;
      margin-bottom: 0.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: var(--shadow-sm);
    }

    .card:hover {
      box-shadow: var(--shadow-md);
      border-color: #dee2e6;
    }

    .card.expanded {
      box-shadow: var(--shadow-lg);
      border-color: #ced4da;
    }

    .card-inner {
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
    }

    /* Publisher Avatar */
    .card-avatar {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      border: 1px solid var(--border-light);
      margin-top: 2px;
    }

    .publisher-logo {
      width: 40px;
      height: 40px;
      object-fit: cover;
      border-radius: 50%;
    }

    .publisher-logo-fallback {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      color: white;
    }

    .card-body {
      flex: 1;
      min-width: 0;
    }

    .card-header {
      margin-bottom: 0.25rem;
    }

    .card-source-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
    }

    .source-name {
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .dot-sep {
      color: var(--text-muted);
      font-size: 0.7rem;
    }

    .time-ago {
      color: var(--text-muted);
      font-weight: 400;
    }

    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    /* Snippet: collapsed / expanded */
    .card-snippet {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.55;
      margin-top: 0.3rem;
    }

    .card-snippet-short {
      display: block;
    }
    .card-snippet-full {
      display: none;
    }

    .card.expanded .card-snippet-short {
      display: none;
    }
    .card.expanded .card-snippet-full {
      display: block;
    }

    /* Card Actions */
    .card-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .expand-btn {
      background: none;
      border: none;
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--accent);
      cursor: pointer;
      padding: 0.2rem 0;
      transition: color 0.15s;
    }
    .expand-btn:hover { color: #C45E1F; }

    .card.expanded .expand-btn::after { content: none; }

    .source-link {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.15s;
      display: none;
    }
    .source-link:hover { color: var(--accent); }

    .card.expanded .source-link {
      display: inline;
    }

    /* ===== SITUATION REPORT — Compact Briefing ===== */
    .sitrep-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: var(--shadow-md);
      border-top: 4px solid var(--accent);
      overflow: hidden;
      margin-bottom: 1rem;
    }

    .sitrep-summary {
      padding: 0.85rem 1.15rem 0.6rem;
      font-size: 0.88rem;
      line-height: 1.55;
      color: var(--text-secondary);
    }

    .sitrep-top-updates {
      padding: 0 1.15rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .sitrep-update-card {
      display: flex;
      flex-direction: column;
      padding: 0.5rem 0.75rem;
      background: var(--bg);
      border-radius: 8px;
      border-left: 3px solid var(--accent);
    }

    .sitrep-update-headline {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text);
      line-height: 1.35;
    }

    .sitrep-update-meta {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }

    .sitrep-expand-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      width: 100%;
      padding: 0.55rem 1.15rem;
      background: none;
      border: none;
      border-top: 1px solid var(--border-light);
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.78rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .sitrep-expand-btn:hover {
      background: var(--bg);
      color: var(--text-secondary);
    }

    .sitrep-expand-chevron {
      transition: transform 0.2s;
      font-size: 1rem;
      line-height: 1;
    }

    .sitrep-expand-btn.open .sitrep-expand-chevron {
      transform: rotate(90deg);
    }

    .sitrep-detail {
      display: none;
      padding: 0.75rem 1.15rem;
      background: var(--bg);
      border-top: 1px solid var(--border-light);
    }

    .sitrep-detail.open {
      display: block;
    }

    .sitrep-detail p {
      font-size: 0.84rem;
      line-height: 1.6;
      color: var(--text-secondary);
      margin: 0;
    }

    .sitrep-footer {
      font-size: 0.68rem;
      color: var(--text-muted);
      padding: 0.45rem 1.15rem;
      margin: 0;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    /* ===== FOOTER ===== */
    .footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.72rem;
      border-top: 1px solid var(--border);
      background: var(--surface);
    }

    /* ===== MOBILE — COMPREHENSIVE UX PASS ===== */

    /* Touch behavior & safe area foundation */
    @supports (padding: env(safe-area-inset-bottom)) {
      body {
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      }
    }

    @media (max-width: 600px) {

      /* --- Global mobile touch feel --- */
      body {
        -webkit-tap-highlight-color: transparent;
        -webkit-text-size-adjust: 100%;
        scroll-padding-top: 64px;
      }

      /* --- Sticky header: dark, bold, compact --- */
      .header-top {
        padding: 0.5rem 1rem;
        padding-top: calc(0.5rem + env(safe-area-inset-top, 0px));
      }

      .header h1 {
        font-size: 1.05rem;
        gap: 0.3rem;
      }

      .header-time {
        font-size: 0.68rem;
      }

      .live-dot {
        width: 6px;
        height: 6px;
      }

      .header-archive-link {
        font-size: 0.72rem;
        padding: 0.3rem 0.55rem;
      }

      .header-accent-bar {
        height: 2px;
      }

      /* --- Filter bar: proper tap targets + scroll hint --- */
      .filter-bar {
        padding: 0.35rem 0;
        gap: 0.5rem;
        /* Fade hint on right edge to signal scrollability */
        -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
        mask-image: linear-gradient(to right, black 85%, transparent 100%);
      }

      .articles-section-header {
        padding: 0.65rem 0 0.25rem;
      }

      .articles-section-label {
        font-size: 0.68rem;
      }

      .filter-btn {
        min-height: 38px;
        padding: 0.45rem 0.85rem;
        font-size: 0.8rem;
        border-radius: 20px;
      }

      /* --- Main container: breathable mobile padding --- */
      .container {
        padding: 0.5rem 0.85rem 2rem;
      }

      .article-count {
        font-size: 0.75rem;
        margin-bottom: 0.4rem;
      }

      /* --- Cards: readable, tappable, responsive --- */
      .card {
        padding: 0.9rem 1rem;
        margin-bottom: 0.45rem;
        border-radius: 10px;
        /* Pressed state feedback for native feel */
        transition: transform 0.1s ease, box-shadow 0.2s ease;
      }

      .card:active {
        transform: scale(0.985);
        box-shadow: var(--shadow-sm);
        background: var(--surface-hover);
      }

      .card-inner {
        gap: 0.75rem;
      }

      .card-avatar {
        width: 36px;
        height: 36px;
        margin-top: 1px;
      }

      .publisher-logo,
      .publisher-logo-fallback {
        width: 36px;
        height: 36px;
        font-size: 1rem;
      }

      .card-header {
        margin-bottom: 0.2rem;
      }

      .card-source-row {
        font-size: 0.78rem;
        gap: 0.3rem;
      }

      .card-title {
        font-size: 0.92rem;
        line-height: 1.4;
        /* Prevent overly long titles from being unreadable */
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .card.expanded .card-title {
        -webkit-line-clamp: unset;
        overflow: visible;
      }

      .card-snippet {
        font-size: 0.84rem;
        line-height: 1.6;
        margin-top: 0.35rem;
        color: var(--text-secondary);
      }

      /* --- Card action buttons: proper mobile tap targets --- */
      .card-actions {
        margin-top: 0.6rem;
        gap: 0rem;
        flex-wrap: wrap;
      }

      .expand-btn {
        min-height: 40px;
        min-width: 44px;
        padding: 0.45rem 0.75rem;
        font-size: 0.82rem;
        display: inline-flex;
        align-items: center;
        border-radius: 8px;
      }

      .expand-btn:active {
        background: var(--accent-soft);
      }

      .source-link {
        min-height: 40px;
        min-width: 44px;
        padding: 0.45rem 0.75rem;
        font-size: 0.82rem;
        display: none;
        align-items: center;
        border-radius: 8px;
      }

      .card.expanded .source-link {
        display: inline-flex;
      }

      .source-link:active {
        background: var(--border-light);
      }

      /* --- Situation Report: compact briefing card --- */
      .sitrep-card {
        border-radius: 10px;
        border-top-width: 3px;
        margin-bottom: 0.75rem;
      }

      .sitrep-summary {
        padding: 0.85rem 1rem 0.6rem;
        font-size: 0.86rem;
        line-height: 1.55;
      }

      .sitrep-top-updates {
        padding: 0 1rem 0.5rem;
        gap: 0.35rem;
      }

      .sitrep-update-card {
        padding: 0.4rem 0.65rem;
        border-radius: 6px;
      }

      .sitrep-update-headline {
        font-size: 0.82rem;
      }

      .sitrep-update-meta {
        font-size: 0.7rem;
      }

      .sitrep-expand-btn {
        padding: 0.5rem 1rem;
        font-size: 0.76rem;
        min-height: 38px;
      }

      .sitrep-detail {
        padding: 0.6rem 1rem;
      }

      .sitrep-detail p {
        font-size: 0.82rem;
      }

      .sitrep-footer {
        font-size: 0.65rem;
        padding: 0.4rem 1rem;
      }

      /* --- Footer: safe area + mobile padding --- */
      .footer {
        padding: 1.5rem 1rem;
        padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
        font-size: 0.7rem;
      }
    }

      /* --- Share button mobile tap target --- */
      .share-btn {
        min-height: 40px;
        min-width: 40px;
        padding: 0.4rem;
      }

      /* --- Back to top: safe area aware --- */
      .back-to-top {
        bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
        right: 1rem;
      }

      /* --- Update toast --- */
      .update-toast {
        top: calc(56px + env(safe-area-inset-top, 0px));
        font-size: 0.78rem;
        padding: 0.5rem 1rem;
      }

      /* --- Urgency badge --- */
      .urgency-badge {
        font-size: 0.6rem;
        padding: 0.08rem 0.35rem;
      }

      /* --- Time filter buttons --- */
      .time-filter-btn {
        min-height: 38px;
        padding: 0.45rem 0.85rem;
        font-size: 0.8rem;
      }

    /* Small phones (iPhone SE / 375px and below) */
    @media (max-width: 375px) {
      .header h1 { font-size: 0.95rem; }
      .header-archive-link { font-size: 0.68rem; padding: 0.25rem 0.45rem; }
      .container { padding: 0.4rem 0.65rem 2rem; }
      .filter-bar { padding: 0.35rem 0; }
      .card { padding: 0.8rem 0.85rem; }
      .card-avatar { width: 32px; height: 32px; }
      .publisher-logo, .publisher-logo-fallback { width: 32px; height: 32px; }
      .card-title { font-size: 0.88rem; }
      .card-snippet { font-size: 0.82rem; }
      .sitrep-card { padding: 0 !important; }
      .sitrep-section { padding: 0.55rem 0.85rem; }
      .sitrep-section-header { font-size: 0.72rem; }
      .sitrep-section p { font-size: 0.82rem !important; }
      .sitrep-section li { font-size: 0.8rem !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-inner">
      <div class="header-top">
        <div class="header-brand">
          <h1><span class="live-dot" id="liveDot"></span> Iran War Update <span class="header-freshness" id="headerFreshness"></span></h1>
          <span class="header-time">🇮🇱 Israel Time (IDT)</span>
        </div>
        <a href="/archive.html" class="header-archive-link">📅 Daily Briefing</a>
      </div>
      <div class="header-accent-bar"></div>
    </div>
  </div>

  <div class="container">
  ${situationReportData ? `
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
    </div>
  ` : ''}
    <div class="articles-section-header">
      <span class="articles-section-label">Latest Articles</span>
      <span class="articles-section-label" id="articleCount" style="font-weight:400">${articles.length} articles · ${sourceStats.filter(s => !s.error).length} sources</span>
    </div>
    <div class="filter-bar" id="articleFilterBar">
      <button class="time-filter-btn" onclick="filterTime('1h', this)">Last 1h</button>
      <button class="time-filter-btn" onclick="filterTime('3h', this)">Last 3h</button>
      <button class="time-filter-btn" onclick="filterTime('6h', this)">Last 6h</button>
      <button class="time-filter-btn" onclick="filterTime('today', this)">Today</button>
      <span class="time-filter-sep"></span>
      <button class="filter-btn active" onclick="filterSource('all')">All</button>
      ${[...new Set(articles.map(a => a.source))].map(s => {
        const logoUrl = PUBLISHER_LOGOS[s] || '';
        const shortName = SHORT_NAMES[s] || s;
        const logoImg = logoUrl ? `<img src="${logoUrl}" class="filter-logo" alt="">` : '';
        return `<button class="filter-btn" onclick="filterSource('${s}')">${logoImg} ${escapeHtml(shortName)}</button>`;
      }).join('\n      ')}
    </div>
    <div id="articles">
      ${articleCards}
    </div>
  </div>

  <!-- Back to top button -->
  <button class="back-to-top" id="backToTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</button>

  <!-- Update toast -->
  <div class="update-toast" id="updateToast" onclick="location.reload()">🔄 New updates available — tap to refresh</div>

  <div class="footer">
    <p>Iran War Update · Aggregated from public RSS feeds · Updated every hour</p>
    <p style="margin-top:0.35rem; opacity:0.7;">hmviva.us</p>
  </div>

  <script>
    // ===== LIVE TIMESTAMP RE-COMPUTATION =====
    function computeTimeAgo(dateStr) {
      const now = new Date();
      const date = new Date(dateStr);
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return diffMins + 'm ago';
      if (diffHours < 24) return diffHours + 'h ago';
      if (diffDays < 7) return diffDays + 'd ago';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function refreshAllTimestamps() {
      document.querySelectorAll('.time-ago[data-date]').forEach(function(el) {
        el.textContent = computeTimeAgo(el.getAttribute('data-date'));
      });
    }

    // Run on load and every 30 seconds
    refreshAllTimestamps();
    setInterval(refreshAllTimestamps, 30000);

    // ===== PAGE FRESHNESS SIGNAL =====
    function updateFreshness() {
      var meta = document.querySelector('meta[name="data-generated-at"]');
      if (!meta) return;
      var generatedAt = new Date(meta.getAttribute('content'));
      var now = new Date();
      var diffMs = now - generatedAt;
      var diffMins = Math.floor(diffMs / 60000);
      var dot = document.getElementById('liveDot');
      var freshLabel = document.getElementById('headerFreshness');

      if (diffMins < 1) {
        freshLabel.textContent = 'Updated just now';
      } else if (diffMins < 60) {
        freshLabel.textContent = 'Updated ' + diffMins + 'm ago';
      } else {
        var diffHours = Math.floor(diffMins / 60);
        freshLabel.textContent = 'Updated ' + diffHours + 'h ago';
      }

      // Update live dot state
      dot.classList.remove('fresh', 'recent', 'stale');
      if (diffMins < 15) {
        dot.classList.add('fresh');
      } else if (diffMins < 60) {
        dot.classList.add('recent');
      } else {
        dot.classList.add('stale');
      }
    }
    updateFreshness();
    setInterval(updateFreshness, 30000);

    // ===== CARD TOGGLE =====
    function toggleCard(card, e) {
      if (e && e.target.closest('a')) return;
      if (e && e.target.closest('.share-btn')) return;
      card.classList.toggle('expanded');
      var btn = card.querySelector('.expand-btn');
      if (btn) {
        btn.textContent = card.classList.contains('expanded') ? 'Show less' : 'Read more';
      }
    }

    // ===== SOURCE FILTER =====
    var activeSourceFilter = 'all';
    var activeTimeFilter = null;

    function applyFilters() {
      var cards = document.querySelectorAll('.card');
      var visible = 0;
      var now = new Date();
      cards.forEach(function(card) {
        var sourceMatch = true;
        var timeMatch = true;

        // Source filter
        if (activeSourceFilter !== 'all') {
          sourceMatch = card.getAttribute('data-source') === activeSourceFilter;
        }

        // Time filter
        if (activeTimeFilter) {
          var dateStr = card.getAttribute('data-date');
          if (dateStr) {
            var articleDate = new Date(dateStr);
            var diffMs = now - articleDate;
            var diffHours = diffMs / 3600000;
            if (activeTimeFilter === '1h') {
              timeMatch = diffHours <= 1;
            } else if (activeTimeFilter === '3h') {
              timeMatch = diffHours <= 3;
            } else if (activeTimeFilter === '6h') {
              timeMatch = diffHours <= 6;
            } else if (activeTimeFilter === 'today') {
              // Today in Israel time
              var todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
              var articleDayStr = articleDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
              timeMatch = todayStr === articleDayStr;
            }
          }
        }

        if (sourceMatch && timeMatch) {
          card.style.display = '';
          visible++;
        } else {
          card.style.display = 'none';
        }
      });
      document.getElementById('articleCount').textContent = visible + ' articles shown';
    }

    function filterSource(source) {
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      event.target.classList.add('active');
      activeSourceFilter = source;
      applyFilters();
    }

    function filterTime(period, btn) {
      var wasActive = btn.classList.contains('active');
      document.querySelectorAll('.time-filter-btn').forEach(function(b) { b.classList.remove('active'); });
      if (wasActive) {
        // Toggle off
        activeTimeFilter = null;
      } else {
        btn.classList.add('active');
        activeTimeFilter = period;
      }
      applyFilters();
    }

    // ===== SHARE BUTTON =====
    function shareArticle(e) {
      e.stopPropagation();
      var btn = e.currentTarget;
      var title = btn.dataset.title;
      var url = btn.dataset.url;
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function() {});
      } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(url).then(function() {
          btn.classList.add('copied');
          setTimeout(function() { btn.classList.remove('copied'); }, 1500);
        }).catch(function() {});
      }
    }

    // ===== BACK TO TOP BUTTON =====
    var backToTopBtn = document.getElementById('backToTop');
    window.addEventListener('scroll', function() {
      if (window.scrollY > 500) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    });

    // ===== UPDATE TOAST (replaces auto-reload) =====
    setTimeout(function() {
      document.getElementById('updateToast').classList.add('visible');
    }, 1 * 60 * 60 * 1000);
  </script>
</body>
</html>`;
}

// ===== DAILY ARTICLE PERSISTENCE =====
function getIsraelDateStr(date) {
  // Get YYYY-MM-DD based on Israel calendar date (Asia/Jerusalem)
  const parts = date.toLocaleDateString('en-CA', { timeZone: ISRAEL_TZ }); // en-CA gives YYYY-MM-DD format
  return parts; // e.g. '2026-04-12'
}

function persistDailyArticles(articles) {
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const today = getIsraelDateStr(new Date()); // Israel calendar date, not UTC
  const dailyFile = path.join(dataDir, `${today}.json`);

  // Load existing articles for today (if any)
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
  // Sort by date, newest first
  merged.sort((a, b) => new Date(b.date) - new Date(a.date));

  fs.writeFileSync(dailyFile, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`📁 Daily archive: ${dailyFile} — ${merged.length} articles (${newArticles.length} new)`);
  return merged;
}

async function main() {
  console.log('🔶 Iran War Update — Fetching latest news...');
  console.log(`   Time: ${new Date().toISOString()}`);

  const { articles, sourceStats } = await fetchAllFeeds();
  console.log(`\n📊 Total: ${articles.length} articles`);

  // Persist articles to daily JSON for archive feature
  persistDailyArticles(articles);

  const situationReportData = await synthesizeReport(articles);
  const html = generateHTML(articles, sourceStats, situationReportData);
  const outPath = path.join(__dirname, 'public', 'index.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf-8');

  console.log(`✅ Generated: ${outPath}`);
  console.log(`   Size: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

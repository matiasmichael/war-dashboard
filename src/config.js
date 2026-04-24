// ===== CONFIGURATION =====
// Central config for Middle East Pulse dashboard.
// All magic numbers, feed definitions, and constants live here.

// --- Named constants (Item #7) ---
const MAX_ARTICLES_PER_SOURCE = 15;
const MAX_ARTICLES_FOR_SYNTHESIS = 25;
const SNIPPET_LENGTH = 120;
const FULL_SNIPPET_LENGTH = 400;
const STALE_THRESHOLD_HOURS = 48;
const RSS_TIMEOUT_MS = 15000;
const GEMINI_MODEL = 'gemini-2.5-flash';
const PORT = 8440;
const TIMEZONE = 'Asia/Jerusalem';

// Retry settings
const GEMINI_RETRY_ATTEMPTS = 2;
const GEMINI_RETRY_DELAY_MS = 5000;
const RSS_RETRY_ATTEMPTS = 2;
const RSS_RETRY_DELAY_MS = 3000;
const UPDATE_TOAST_DELAY_MS = 3600000; // 1 hour

// --- Consolidated FEEDS config (Item #6, #10) ---
// Each feed has all metadata in one place. `staleThresholdHours` replaces the CNN hardcode.
// `faviconDomain` is used to derive the Google Favicon URL at runtime via `getFaviconUrl()`.
const FEEDS = [
  {
    name: 'Ynet News',
    shortName: 'Ynet',
    url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml',
    emoji: '🇮🇱',
    faviconDomain: 'ynet.co.il',
    color: '#e74c3c',
    accentLight: '#fef2f2',
    keywords: null,
    staleThresholdHours: null
  },
  {
    name: 'Haaretz',
    shortName: 'Haaretz',
    url: 'https://www.haaretz.com/cmlink/1.4478498',
    emoji: '📰',
    faviconDomain: 'haaretz.com',
    color: '#006400',
    accentLight: '#f0fdf4',
    keywords: null,
    staleThresholdHours: null,
    sanitizeXml: true,
    // DISABLED: Haaretz's RSS endpoint returns a full HTML paywall page (1.3MB) to all
    // non-whitelisted user agents. Their Varnish CDN either 403s or serves HTML — no
    // valid XML is ever returned. Keeping this entry in the config but skipping it in
    // fetchAllFeeds prevents noisy fetch errors on every cron cycle.
    // Re-enable if a working RSS URL is found (e.g. behind a subscription cookie).
    disabled: true
  },
  {
    name: 'CNBC',
    shortName: 'CNBC',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362',
    emoji: '📈',
    faviconDomain: 'cnbc.com',
    customLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/CNBC_logo.svg/320px-CNBC_logo.svg.png',
    color: '#005594',
    accentLight: '#eff6ff',
    keywords: ['israel', 'gaza', 'hamas', 'hezbollah', 'iran', 'lebanon', 'middle east', 'idf', 'hostage', 'ceasefire', 'netanyahu', 'palestinian', 'west bank', 'war', 'beirut', 'houthi', 'yemen', 'syria', 'hormuz', 'sanctions', 'oil', 'tehran'],
    staleThresholdHours: null
  },
  {
    name: 'Fox News',
    shortName: 'Fox',
    url: 'https://moxie.foxnews.com/google-publisher/world.xml',
    emoji: '🦊',
    faviconDomain: 'foxnews.com',
    color: '#003366',
    accentLight: '#eff6ff',
    keywords: ['israel', 'gaza', 'hamas', 'hezbollah', 'iran', 'lebanon', 'middle east', 'idf', 'hostage', 'ceasefire', 'netanyahu', 'palestinian', 'west bank', 'tel aviv', 'jerusalem', 'beirut', 'tehran', 'houthi', 'yemen', 'syria', 'war'],
    staleThresholdHours: null
  },
  {
    name: 'BBC News',
    shortName: 'BBC',
    url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
    emoji: '🇬🇧',
    faviconDomain: 'bbc.com',
    color: '#b80000',
    accentLight: '#fef2f2',
    keywords: null,
    staleThresholdHours: null
  },
  {
    name: 'Al Jazeera',
    shortName: 'Al Jaz',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    emoji: '🌍',
    faviconDomain: 'aljazeera.com',
    color: '#c68e17',
    accentLight: '#fefce8',
    keywords: ['israel', 'gaza', 'hamas', 'hezbollah', 'iran', 'lebanon', 'middle east', 'idf', 'hostage', 'ceasefire', 'netanyahu', 'palestinian', 'west bank', 'war', 'beirut', 'houthi', 'yemen', 'syria'],
    staleThresholdHours: null
  },
  {
    name: 'NPR',
    shortName: 'NPR',
    url: 'https://feeds.npr.org/1004/rss.xml',
    emoji: '🎙️',
    faviconDomain: 'npr.org',
    color: '#2880b9',
    accentLight: '#eff6ff',
    keywords: ['israel', 'gaza', 'hamas', 'hezbollah', 'iran', 'lebanon', 'middle east', 'idf', 'hostage', 'ceasefire', 'netanyahu', 'palestinian', 'west bank', 'war', 'beirut', 'houthi', 'yemen', 'syria'],
    staleThresholdHours: null
  },
  {
    name: 'Times of Israel',
    shortName: 'ToI',
    url: 'https://www.timesofisrael.com/feed/',
    emoji: '🕎',
    faviconDomain: 'timesofisrael.com',
    color: '#1a5276',
    accentLight: '#eff6ff',
    keywords: null,
    staleThresholdHours: null
  },
  {
    name: 'Jerusalem Post',
    shortName: 'J. Post',
    url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx',
    emoji: '📜',
    faviconDomain: 'jpost.com',
    color: '#2c3e50',
    accentLight: '#f8fafc',
    keywords: null,
    staleThresholdHours: null,
    // JPost pre-schedules articles with future pubDates in the RSS feed.
    // When this flag is set, fetcher.js will scrape the article HTML for the
    // real datePublished from the JSON-LD schema for any future-dated item.
    fixFutureDates: true
  }
];

// ===== VIDEO FEED CONFIG =====

// Relevance filter keywords for general channels
const VIDEO_KEYWORDS = [
  'israel', 'israeli', 'iran', 'iranian', 'gaza', 'hezbollah', 'lebanon', 'lebanese',
  'hamas', 'middle east', 'tehran', 'jerusalem', 'houthi', 'yemen', 'yemeni',
  'west bank', 'idf', 'netanyahu', 'sinwar', 'rafah', 'beirut', 'tel aviv',
  'occupied', 'ceasefire', 'hostage', 'hostages', 'october 7', 'irgc',
  'vance', 'hegseth',
  'peace', 'war', 'strike', 'strikes', 'missile', 'missiles',
  'defense', 'attack', 'bombing',
  'negotiation', 'negotiations', 'summit', 'diplomacy', 'diplomat'
];

// Channels that require relevance filtering (by name)
const FILTERED_VIDEO_CHANNELS = new Set(['The White House', 'C-SPAN', 'Fox News', 'CNN']);

// YouTube Channels
const VIDEO_CHANNELS = [
  {
    id: 'UC4XJnRPZjXhgvVMhXKNSJvQ',
    name: 'Israeli PM',
    faviconDomain: 'gov.il',
    color: '#0038b8'
  },
  {
    id: 'UCawNWlihdgaycQpO3zi-jYg',
    name: 'IDF',
    faviconDomain: 'idf.il',
    color: '#4a7c59'
  },
  {
    id: 'UCYxRlFDqcWM4y7FfpiAN3KQ',
    name: 'The White House',
    faviconDomain: 'whitehouse.gov',
    color: '#002868'
  },
  {
    id: 'UCb--64Gl51jIEVE-GLDAVTg',
    name: 'C-SPAN',
    faviconDomain: 'c-span.org',
    color: '#003366'
  },
  {
    id: 'UCXIJgqnII2ZOINSWNOGFThA',
    name: 'Fox News',
    faviconDomain: 'foxnews.com',
    color: '#003366'
  },
  {
    id: 'UCupvZG-5ko_eiXAupbDfxWw',
    name: 'CNN',
    faviconDomain: 'cnn.com',
    color: '#cc0000'
  }
];

// ===== STARTUP VALIDATION =====

const fs = require('fs');
const path = require('path');

/**
 * Read the Gemini API key from OpenClaw config.
 * Centralised here so synthesizer.js and synthesize-developments.js
 * don't each carry their own copy.
 */
function getGeminiKey() {
  const configPath = path.join(process.env.HOME, '.openclaw/openclaw.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `OpenClaw config not found at ${configPath}. ` +
      'Ensure ~/.openclaw/openclaw.json exists with env.GOOGLE_API_KEY.'
    );
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const key = config.env && config.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_API_KEY not found in ~/.openclaw/openclaw.json → env.GOOGLE_API_KEY. ' +
      'Gemini synthesis will fail without it.'
    );
  }
  return key;
}

// Derive Google Favicon URL from domain
function getFaviconUrl(domain) {
  // Try to find if this domain has a custom logo defined in FEEDS
  const feed = FEEDS.find(f => f.faviconDomain === domain);
  if (feed && feed.customLogo) {
    return feed.customLogo;
  }
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

module.exports = {
  MAX_ARTICLES_PER_SOURCE,
  MAX_ARTICLES_FOR_SYNTHESIS,
  SNIPPET_LENGTH,
  FULL_SNIPPET_LENGTH,
  STALE_THRESHOLD_HOURS,
  RSS_TIMEOUT_MS,
  GEMINI_MODEL,
  PORT,
  TIMEZONE,
  GEMINI_RETRY_ATTEMPTS,
  GEMINI_RETRY_DELAY_MS,
  RSS_RETRY_ATTEMPTS,
  RSS_RETRY_DELAY_MS,
  UPDATE_TOAST_DELAY_MS,
  FEEDS,
  VIDEO_CHANNELS,
  VIDEO_KEYWORDS,
  FILTERED_VIDEO_CHANNELS,
  getGeminiKey,
  getFaviconUrl
};

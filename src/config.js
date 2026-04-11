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
    name: 'The Guardian',
    shortName: 'Guardian',
    url: 'https://www.theguardian.com/world/middleeast/rss',
    emoji: '🌐',
    faviconDomain: 'theguardian.com',
    color: '#052962',
    accentLight: '#eff6ff',
    keywords: null,
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

// Derive Google Favicon URL from domain
function getFaviconUrl(domain) {
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
  getFaviconUrl
};

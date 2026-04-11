// ===== VIDEO FETCHER =====
// Fetches YouTube RSS feeds from key channels (PM Office, IDF, White House, C-SPAN, Fox News, CNN),
// extracts video metadata, and saves to data/videos.json.
// YouTube Atom feeds don't require an API key — just the channel ID.

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('./src/utils');

const MAX_VIDEOS = 30;
const FETCH_TIMEOUT_MS = 10000;

// --- Relevance filter keywords for general channels ---
const MIDDLE_EAST_KEYWORDS = [
  // Geo & factions
  'israel', 'israeli', 'iran', 'iranian', 'gaza', 'hezbollah', 'lebanon', 'lebanese',
  'hamas', 'middle east', 'tehran', 'jerusalem', 'houthi', 'yemen', 'yemeni',
  'west bank', 'idf', 'netanyahu', 'sinwar', 'rafah', 'beirut', 'tel aviv',
  'occupied', 'ceasefire', 'hostage', 'hostages', 'october 7', 'irgc',
  // US officials & diplomacy — broad conflict terms that surface WH/C-SPAN coverage
  'vance', 'hegseth',
  'peace', 'war', 'strike', 'strikes', 'missile', 'missiles',
  'defense', 'attack', 'bombing',
  'negotiation', 'negotiations', 'summit', 'diplomacy', 'diplomat'
];

// Channels that require relevance filtering (by name)
const FILTERED_CHANNELS = new Set(['The White House', 'C-SPAN', 'Fox News', 'CNN']);

/**
 * Returns true if the video is relevant to the Middle East conflict.
 * Israeli PM and IDF are always relevant; others require keyword match.
 */
function isRelevant(video) {
  if (!FILTERED_CHANNELS.has(video.channel)) return true; // IDF / Israeli PM always pass
  const haystack = (video.title + ' ' + video.description).toLowerCase();
  return MIDDLE_EAST_KEYWORDS.some(kw => haystack.includes(kw));
}

// --- YouTube Channels ---
const CHANNELS = [
  {
    id: 'UC4XJnRPZjXhgvVMhXKNSJvQ',
    name: 'Israeli PM',
    emoji: '🇮🇱',
    color: '#0038b8'
  },
  {
    id: 'UCawNWlihdgaycQpO3zi-jYg',
    name: 'IDF',
    emoji: '⚔️',
    color: '#4a7c59'
  },
  {
    id: 'UCYxRlFDqcWM4y7FfpiAN3KQ',
    name: 'The White House',
    emoji: '🇺🇸',
    color: '#002868'
  },
  {
    id: 'UCb--64Gl51jIEVE-GLDAVTg',
    name: 'C-SPAN',
    emoji: '📺',
    color: '#003366'
  },
  {
    id: 'UCXIJgqnII2ZOINSWNOGFThA',
    name: 'Fox News',
    emoji: '🦊',
    color: '#003366'
  },
  {
    id: 'UCupvZG-5ko_eiXAupbDfxWw',
    name: 'CNN',
    emoji: '🔴',
    color: '#cc0000'
  }
];

/**
 * Parse a YouTube Atom feed XML string and extract video entries.
 * Uses simple regex parsing to avoid adding XML dependencies.
 */
function parseYouTubeFeed(xml, channel) {
  const entries = [];
  // Match each <entry>...</entry> block
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];

    const videoId = extractTag(block, 'yt:videoId');
    const title = extractTag(block, 'title');
    const published = extractTag(block, 'published');
    const updated = extractTag(block, 'updated');

    // Extract media:description if present
    const description = extractTag(block, 'media:description') || '';

    if (!videoId || !title) continue;

    entries.push({
      videoId,
      title: decodeXmlEntities(title),
      link: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      published: published || updated || new Date().toISOString(),
      description: decodeXmlEntities(description).slice(0, 300),
      channel: channel.name,
      channelEmoji: channel.emoji,
      channelColor: channel.color,
      channelId: channel.id
    });
  }

  return entries;
}

/** Extract text content of a simple XML tag */
function extractTag(xml, tagName) {
  // Handle both <tag>content</tag> and self-closing
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Decode common XML entities */
function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

/**
 * Fetch a single channel's YouTube RSS feed.
 */
async function fetchChannelFeed(channel) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const xml = await res.text();
    const videos = parseYouTubeFeed(xml, channel);
    return videos;
  } catch (err) {
    console.error(`  ✗ ${channel.name}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main: fetch all channels, merge, sort, cap, and save.
 */
async function main() {
  console.log('[VIDEOS] 🎬 Fetching YouTube feeds...');

  const results = await Promise.allSettled(
    CHANNELS.map(ch => {
      console.log(`  → ${ch.emoji} ${ch.name}...`);
      return fetchChannelFeed(ch);
    })
  );

  let allVideos = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const channel = CHANNELS[i];
    if (result.status === 'fulfilled') {
      const videos = result.value;
      allVideos.push(...videos);
      console.log(`  ✓ ${channel.name}: ${videos.length} videos`);
    } else {
      console.error(`  ✗ ${channel.name}: ${result.reason?.message || 'unknown error'}`);
    }
  }

  // Filter for relevance BEFORE capping so we don't end up with an empty list
  const beforeFilter = allVideos.length;
  allVideos = allVideos.filter(isRelevant);
  console.log(`[VIDEOS] 🔍 Relevance filter: ${beforeFilter} → ${allVideos.length} videos`);

  // Sort newest first, cap at MAX_VIDEOS
  allVideos.sort((a, b) => new Date(b.published) - new Date(a.published));
  allVideos = allVideos.slice(0, MAX_VIDEOS);

  // Save to data/videos.json
  const outPath = path.join(__dirname, 'data', 'videos.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  atomicWriteSync(outPath, JSON.stringify(allVideos, null, 2));

  console.log(`[VIDEOS] 💾 Saved ${allVideos.length} videos to ${outPath}`);
  return allVideos;
}

// Allow both direct execution and require()
if (require.main === module) {
  main().catch(err => {
    console.error('[VIDEOS] ❌ Fatal:', err);
    process.exit(1);
  });
}

module.exports = { main, CHANNELS };

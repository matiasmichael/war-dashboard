// ===== VIDEO FETCHER =====
// Fetches YouTube RSS feeds from key channels (PM Office, IDF, White House, C-SPAN, Fox News, CNN),
// extracts video metadata, and saves to data/videos.json.
// YouTube Atom feeds don't require an API key — just the channel ID.

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('./src/utils');
const { VIDEO_CHANNELS, VIDEO_KEYWORDS, FILTERED_VIDEO_CHANNELS } = require('./src/config');

const MAX_VIDEOS = 30;
const FETCH_TIMEOUT_MS = 10000;

/**
 * Returns true if the video is relevant to the Middle East conflict.
 * Israeli PM and IDF are always relevant; others require keyword match.
 */
function isRelevant(video) {
  if (!FILTERED_VIDEO_CHANNELS.has(video.channel)) return true; // IDF / Israeli PM always pass
  const haystack = (video.title + ' ' + video.description).toLowerCase();
  return VIDEO_KEYWORDS.some(kw => haystack.includes(kw));
}

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
      channelFaviconDomain: channel.faviconDomain,
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
    VIDEO_CHANNELS.map(ch => {
      console.log(`  → ${ch.name}...`);
      return fetchChannelFeed(ch);
    })
  );

  let allVideos = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const channel = VIDEO_CHANNELS[i];
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

module.exports = { main, VIDEO_CHANNELS };

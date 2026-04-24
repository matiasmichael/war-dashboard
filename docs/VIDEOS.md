# Video Pipeline — Middle East Pulse

Documentation for the YouTube video feed system: channels, relevance filtering, and integration with the dashboard.

---

## Overview

The video pipeline fetches YouTube RSS (Atom) feeds from 6 key channels, filters for Middle East conflict relevance, and serves them on the `/videos` page. Unlike the article pipeline, videos use YouTube's free Atom feeds — **no API key required**.

**Entry point**: `fetch-videos.js`  
**Output**: `data/videos.json`  
**Page**: `src/pages/videos.astro` (EN) / `src/pages/he/videos.astro` (HE)

---

## How It Works

```
YouTube Atom Feeds (6 channels)
        │
        ▼  [every 3 min, via fetch-data pipeline]
  fetch-videos.js
  - Parallel fetch (Promise.allSettled)
  - Parse XML → extract videoId, title, published, description
  - Relevance keyword filtering (for general channels)
  - Sort newest-first, cap at 30 videos
  - Atomic write → data/videos.json
        │
        ▼
  build.js → Astro reads data/videos.json at build time
        │
        ▼
  /videos page with inline YouTube playback + channel filters
```

---

## Channels

| Channel | YouTube Channel ID | Favicon Domain | Relevance Filter |
|---------|-------------------|----------------|-----------------|
| 🇮🇱 Israeli PM | `UC4XJnRPZjXhgvVMhXKNSJvQ` | `gov.il` | None (always relevant) |
| 🪖 IDF | `UCawNWlihdgaycQpO3zi-jYg` | `idf.il` | None (always relevant) |
| 🇺🇸 The White House | `UCYxRlFDqcWM4y7FfpiAN3KQ` | `whitehouse.gov` | Keyword filtered |
| 📺 C-SPAN | `UCb--64Gl51jIEVE-GLDAVTg` | `c-span.org` | Keyword filtered |
| 🦊 Fox News | `UCXIJgqnII2ZOINSWNOGFThA` | `foxnews.com` | Keyword filtered |
| 📰 CNN | `UCupvZG-5ko_eiXAupbDfxWw` | `cnn.com` | Keyword filtered |

**Israeli PM** and **IDF** channels are always fully included — every video is relevant by definition. All other channels are keyword-filtered to surface only Middle East conflict content.

---

## Relevance Keywords

General channels (White House, C-SPAN, Fox News, CNN) are filtered against this keyword set. A match in `title + description` (case-insensitive) is sufficient to include the video.

```
israel, israeli, iran, iranian, gaza, hezbollah, lebanon, lebanese,
hamas, middle east, tehran, jerusalem, houthi, yemen, yemeni,
west bank, idf, netanyahu, sinwar, rafah, beirut, tel aviv,
occupied, ceasefire, hostage, hostages, october 7, irgc,
vance, hegseth,
peace, war, strike, strikes, missile, missiles,
defense, attack, bombing,
negotiation, negotiations, summit, diplomacy, diplomat
```

**Known noise**: The keyword `war` can match unrelated titles (e.g., "homeward" in NASA content). This is an acceptable trade-off — false positives are rare and preferable to missing conflict coverage.

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_VIDEOS` | 30 | Maximum videos displayed after filtering |
| `FETCH_TIMEOUT_MS` | 10000 | Per-channel fetch timeout (10s) |

---

## Video Object Schema

Each video in `data/videos.json`:

```json
{
  "videoId": "dQw4w9WgXcQ",
  "title": "Decoded video title",
  "link": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "thumbnail": "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
  "published": "2026-04-12T14:30:00+00:00",
  "description": "First 300 chars of video description...",
  "channel": "IDF",
  "channelFaviconDomain": "idf.il",
  "channelColor": "#4a7c59",
  "channelId": "UCawNWlihdgaycQpO3zi-jYg"
}
```

---

## Frontend Features (`videos.astro`)

- **Channel filter buttons** — Filter by channel with real favicon icons (not emojis)
- **Inline YouTube playback** — Click a video card to open a modal with an embedded YouTube player. Spring-curve animation on open/close.
- **Video count badge** — Shows total and filtered count
- **Thumbnail grid** — Responsive card layout with channel badge, title, and relative timestamp

---

## XML Parsing

YouTube Atom feeds are parsed with simple regex extraction (no XML library dependency). The parser extracts `<entry>` blocks and pulls `yt:videoId`, `title`, `published`, `updated`, and `media:description` tags. XML entities (`&amp;`, `&lt;`, etc.) are decoded.

This approach avoids adding `rss-parser` or an XML dependency for a well-structured feed format.

---

## How to Add a Channel

1. Find the YouTube channel ID:
   - Go to the channel page → View Page Source → search for `channel_id` or `externalId`
   - Or use: `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` to verify

2. Add to `CHANNELS` array in `fetch-videos.js`:
   ```js
   {
     id: 'UCxxxxxxxxxxxxxxxxxxxxxx',
     name: 'Channel Name',
     faviconDomain: 'example.com',
     color: '#hex'
   }
   ```

3. If the channel is general-purpose (not exclusively Middle East), add its name to the `FILTERED_CHANNELS` set so keyword filtering applies.

4. Test: `node fetch-videos.js`

---

## How to Remove a Channel

Remove the entry from `CHANNELS` in `fetch-videos.js`. Run `node fetch-videos.js` to regenerate `data/videos.json`, then `node build.js` to rebuild the site.

---

## Integration Notes

- **Separate from article pipeline**: `fetch-videos.js` is called from `fetch-data.js` as part of the Layer 1 pipeline, but maintains its own channel config and output file (`data/videos.json`).
- **No Gemini dependency**: Unlike article synthesis, videos are never sent to Gemini. Relevance is determined purely by keyword matching.
- **Config location**: Channel definitions are currently in `fetch-videos.js` (not `src/config.js`). This is a known divergence from the centralized config pattern used by article feeds.
- **Atomic writes**: Uses `atomicWriteSync()` from `src/utils.js`, same as the article pipeline.

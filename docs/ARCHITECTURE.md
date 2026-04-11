# Architecture — Middle East Pulse

Deep technical reference for the data pipeline, feed system, and build process.

---

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Layer 1: Data Collection](#layer-1-data-collection)
3. [Layer 2: AI Synthesis](#layer-2-ai-synthesis)
4. [Layer 3: Build & Serve](#layer-3-build--serve)
5. [Feed Configuration Schema](#feed-configuration-schema)
6. [Timestamp Handling & Timezone Corrections](#timestamp-handling--timezone-corrections)
7. [Caching, Deduplication & Persistence](#caching-deduplication--persistence)
8. [Static Output & Serving](#static-output--serving)
9. [Daily Archive System](#daily-archive-system)

---

## Pipeline Overview

The system is split into 3 independently-scheduled layers. Each layer is stateless relative to the others — they communicate only through files on disk.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Data Collection (every 3 minutes)                            │
│                                                                         │
│  RSS Feeds ──── src/fetcher.js ──── src/persistence.js                  │
│  (8 sources)    (fetch, filter,     (deduplicate, atomic                 │
│                  normalize)          write to data/YYYY-MM-DD.json)      │
│                      │                                                  │
│                      └──── src/synthesize-developments.js               │
│                             (Gemini: 4 key devs → data/developments.json)│
└─────────────────────────────────────────────────────────────────────────┘
                               ↓ files on disk
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — AI Synthesis (every 1 hour)                                  │
│                                                                         │
│  data/YYYY-MM-DD.json ──── src/synthesizer.js ──── data/sitrep-latest.json│
│  (full day articles)        (Gemini: sitrep with     (+ data/last-sitrep.json│
│                              delta framing)            for delta context) │
│                                   │                                     │
│                                   └── triggers build.js                 │
└─────────────────────────────────────────────────────────────────────────┘
                               ↓ files on disk
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Build & Serve                                                │
│                                                                         │
│  data/*.json ──── build.js ──── src/data/latest.json ──── Astro build   │
│                   (assembles)    (single data file      (→ dist/)         │
│                                  for Astro pages)                        │
│                                                          ↓               │
│                                                    server.js :8440       │
│                                                    (Express → Cloudflare)│
└─────────────────────────────────────────────────────────────────────────┘
```

### Why Separate Layers?

| Concern | Reason |
|---------|--------|
| Fetch frequency vs. Gemini cost | Fetching every 3 min vs. synthesizing every 1 hr saves ~20× Gemini API calls per hour |
| Resilience | Layer 2 failure doesn't block Layer 1; articles still accumulate |
| Context quality | Gemini gets the full day's 100+ articles for better briefings, not just the latest 15 |
| Rebuild without refetch | `node build.js` can be run standalone after UI changes |

---

## Layer 1: Data Collection

**Entry point**: `fetch-data.js`  
**Scheduled**: every 3 minutes via `com.war-dashboard.fetch-data` LaunchAgent

### Step 1 — Parallel Fetch (`src/fetcher.js`)

All active feeds are fetched in parallel using `Promise.allSettled()`. A single feed failure does not block others.

```
Promise.allSettled([
  fetchSingleFeed(Ynet),
  fetchSingleFeed(BBC),
  fetchSingleFeed(JPost),
  ...
])
```

Each `fetchSingleFeed()` call:
1. Optionally pre-sanitizes XML (`sanitizeXml: true` feeds like Haaretz)
2. Parses RSS via `rss-parser` with a 15-second timeout
3. Applies keyword filtering if the feed has a `keywords` array
4. Drops CNN section nav links (`cnnTitleFix` logic — legacy, kept for reference)
5. Slices to `MAX_ARTICLES_PER_SOURCE` (15) per feed
6. Applies stale filter if `staleThresholdHours` is set
7. Applies **JPost timezone correction** if `fixFutureDates: true`
8. Normalizes all dates to strict ISO 8601 UTC strings
9. Returns normalized article objects

**Retry logic**: 2 attempts with a 3-second delay between them.

### Step 2 — Persist (`src/persistence.js`)

`persistDailyArticles()` merges the fresh articles into `data/YYYY-MM-DD.json`:

1. Loads existing daily file (if any)
2. Purges URLs flagged for removal (pre-scheduled articles evicted by date scraper)
3. **Refreshes mutable fields** for existing articles: `title`, `snippet`, `date`
4. Clamps lingering future timestamps to `now` for articles no longer in the live feed
5. Appends genuinely new articles (URLs not yet seen today)
6. Sorts all articles by date, newest first
7. Atomic writes to disk (`write .tmp` → `rename`)

The date for "today" is always computed in `Asia/Jerusalem` timezone, so a new file starts at midnight IDT/IST — not UTC midnight.

### Step 3 — Synthesize Developments (`src/synthesize-developments.js`)

Called directly from `fetch-data.js` after persistence. Runs on every fetch cycle (not just hourly).

1. Reads the top 25 articles from today's archive
2. Sends them to Gemini (`gemini-2.5-flash`) with a specific prompt
3. Receives a JSON response with 4 developments
4. Validates and normalizes fields (severity, category, headline length limits)
5. Atomic writes to `data/developments.json`

**Why run this on every fetch cycle?** Developments change faster than hourly — a major strike may be reported within 3 minutes of happening. Running it here keeps the "Key Developments" grid fresh.

---

## Layer 2: AI Synthesis

**Entry point**: `synthesize.js`  
**Scheduled**: every 1 hour via `com.war-dashboard.synthesize` LaunchAgent

### Sitrep Generation (`src/synthesizer.js`)

1. Reads all articles from today's `data/YYYY-MM-DD.json` (full day accumulation)
2. Optionally loads `data/last-sitrep.json` for delta context
3. Sends top 25 articles + previous sitrep summary to Gemini
4. Receives structured JSON: `{ summary, top_updates, detailed_analysis }`
5. Saves result to:
   - `data/sitrep-latest.json` (current sitrep, read by build.js)
   - `data/last-sitrep.json` (previous sitrep, read on next Gemini call for delta)
6. Triggers `build.js`

### Delta Framing

The sitrep prompt passes the **previous briefing's headlines** as context, but only for the `detailed_analysis` field. The `summary` field is always a pure snapshot — no "since last update" language allowed.

```
PREVIOUS BRIEFING (generated at <ISO>):
Top Updates: <headline 1>; <headline 2>; <headline 3>
Analysis: <previous analysis>

USE THE PREVIOUS BRIEFING ONLY for "detailed_analysis" — to note shifts or new 
developments since last cycle. Do NOT reference it in "summary" at all.
```

### Error Handling

If Gemini fails after 2 retries:
- Error is written to `data/last-error.json`
- `synthesize.js` logs `⚠️ Gemini synthesis failed` but continues to `build.js`
- The build proceeds without a sitrep — the UI shows a warning badge instead

---

## Layer 3: Build & Serve

**Entry point**: `build.js`  
**Triggered by**: `synthesize.js` after sitrep generation (or manually)

### Build Process

1. Determines today's Israel date (`getIsraelDateStr`)
2. Reads `data/YYYY-MM-DD.json` → articles
3. Reads `data/sitrep-latest.json` → sitrep (optional, warn if missing)
4. Reads `data/developments.json` → developments (optional, warn if missing)
5. Computes source stats (article count per source)
6. Atomic writes to `src/data/latest.json`:

```json
{
  "articles": [...],
  "sourceStats": [{ "name": "BBC", "logo": "🇬🇧", "count": 15 }],
  "sitrep": { "summary": "...", "top_updates": [...], "detailed_analysis": "..." },
  "developments": [...],
  "generatedAt": "ISO timestamp"
}
```

7. Runs `npx astro build` — this reads `src/data/latest.json` at build time and generates `dist/`

### Serving

`server.js` (Express) serves:

| Route | Handler |
|-------|---------|
| `/*` | Static files from `dist/` (Astro output), `maxAge: 5m` |
| `/data/*` | Static files from `data/` directory, `maxAge: 1m` |
| `/api/archive/dates` | Lists available daily briefing dates |
| `/api/archive/:date` | Returns a specific daily briefing JSON |
| `/health` | Health check endpoint |
| `/archive.html` | 301 redirect to `/archive/` (legacy URL) |

PM2 keeps `server.js` alive and auto-restarts on crash.

---

## Feed Configuration Schema

Defined in `src/config.js` → `FEEDS` array.

```typescript
interface Feed {
  name: string;              // Full display name: "Times of Israel"
  shortName: string;         // Abbreviated: "ToI"
  url: string;               // RSS feed URL
  emoji: string;             // Article logo emoji
  faviconDomain: string;     // Domain for Google Favicon API (sz=128)
  color: string;             // Hex color for article card accent
  accentLight: string;       // Hex color for article card background tint
  keywords: string[] | null; // Keyword filter; null = accept all
  staleThresholdHours: number | null; // Drop articles older than N hours; null = unlimited
  
  // Optional flags:
  disabled?: boolean;        // Skip this feed entirely
  sanitizeXml?: boolean;     // Pre-sanitize malformed XML
  fixFutureDates?: boolean;  // Apply JPost IDT→UTC timezone correction
  cnnTitleFix?: boolean;     // CNN title/section-link cleanup (legacy)
  dropNoDate?: boolean;      // Drop articles with no pubDate (legacy CNN)
}
```

### Favicon URL Generation

`getFaviconUrl(domain)` returns:
```
https://www.google.com/s2/favicons?domain=<domain>&sz=128
```

Used as `publisherLogo` on each article object, displayed as a favicon in article cards.

### Keyword Filtering

Feeds with a `keywords` array only accept articles where the combined `title + contentSnippet + content` contains at least one of the listed keywords (case-insensitive). This is used for feeds that cover broad world news (CNBC, Fox, NPR, Al Jazeera) to filter down to Middle East conflict stories.

Feeds without keywords (`keywords: null`) — Ynet, BBC Middle East, ToI, JPost — are already region-specific and accept all articles.

---

## Timestamp Handling & Timezone Corrections

This is the most complex part of the codebase. Multiple issues required layered fixes.

### Problem 1: JPost IDT Mislabeled as GMT

**Root cause**: Jerusalem Post's CMS stamps RSS `pubDate` values in Israel local time (IDT in summer = UTC+3, IST in winter = UTC+2) but appends the `GMT` label. This is an encoding bug in their CMS, not a user error.

**Effect**: All JPost articles appear 2–3 hours in the future when parsed literally by `rss-parser`.

**Fix**: `correctJPostTimezone()` in `src/fetcher.js`:

```
1. Parse the mislabeled date as-is → get the "wrong UTC" value
2. Get Israel local time components for that moment using Intl.DateTimeFormat
3. Reconstruct the "Israel local as if UTC" date
4. Compute offset = israelLocalAsUtc − wrongUtc
   (e.g., IDT = +10800000 ms = +3h)
5. True UTC = wrongUtc − offset
```

This uses `Intl.DateTimeFormat` with `timeZone: 'Asia/Jerusalem'`, which correctly handles DST transitions between IST (UTC+2, Oct–Apr) and IDT (UTC+3, Apr–Oct) without any hardcoded offset tables.

**Example**:
```
RSS:       "Sat, 11 Apr 2026 21:18:16 GMT"  (mislabeled IDT as GMT)
Parsed as: 2026-04-11T21:18:16Z  (wrong UTC)
Israel offset Apr 11: +3h (IDT)
True UTC:  2026-04-11T18:18:16Z  ✓
```

### Problem 2: Pre-Scheduled JPost Articles

JPost sometimes adds articles to their RSS feed hours before the article is live, with a future `datePublished`. After timezone correction, some articles still have a future timestamp.

**Fix**: `fetchRealPublishDate()` scrapes the article HTML for the real publish date, checking:
1. `<script type="application/ld+json">` (NewsArticle schema)
2. Raw `"datePublished":"..."` anywhere in the page (Next.js RSC payload)
3. `<time datetime="...">` element
4. OpenGraph `<meta property="article:published_time">`

Articles still in the future beyond a 30-minute tolerance window after scraping are dropped and logged.

### Problem 3: Date String Format Inconsistency

`rss-parser` sets `isoDate` (ISO 8601) when it can parse `pubDate`, but falls back to the raw RFC 2822 string when parsing fails. The normalizer always runs through `new Date(rawDate).toISOString()` to guarantee a uniform UTC string before persistence.

### Date Normalization Flow (per article)

```
rawDate = item.isoDate || item.pubDate

if (!rawDate)                  → sentinel "2000-01-01T00:00:00Z", noDate=true
else if (isNaN(new Date(raw))) → sentinel "2000-01-01T00:00:00Z", noDate=true
else if (date > now)
  if (item._correctedDate)     → use timezone-corrected date
  else                         → clamp to now, log warning
else
  if (item._correctedDate)     → use timezone-corrected date (JPost normal-past case)
  else                         → new Date(rawDate).toISOString()
```

---

## Caching, Deduplication & Persistence

### Daily File Structure

Articles are accumulated into a daily file: `data/YYYY-MM-DD.json`  
The date is computed in `Asia/Jerusalem` timezone, so the file rolls over at IDT midnight, not UTC midnight.

Format: a flat JSON array of article objects, sorted newest-first.

```typescript
interface Article {
  title: string;
  link: string;        // URL — used as deduplication key
  snippet: string;     // First 400 chars of article text
  date: string;        // ISO 8601 UTC string
  source: string;      // Feed name: "BBC News"
  logo: string;        // Emoji: "🇬🇧"
  color: string;       // Hex color
  accentLight: string; // Hex light color
  publisherLogo: string; // Google Favicon URL
  noDate?: boolean;    // True if date could not be determined
}
```

### Deduplication Logic

On each fetch cycle, `persistDailyArticles()` merges new articles into the existing daily file:

```
For each existing article:
  if (URL exists in new fetch):
    → refresh title, snippet, date (mutable fields may change)
  else:
    → keep as-is, but clamp future timestamps to now

For each new article:
  if (URL not in existing):
    → append to merged array
```

This approach means:
- We never have duplicates (URL is the key)
- Headlines and timestamps stay accurate even when publishers update them
- Stale future-timestamp artifacts from earlier runs get corrected over time

### Atomic Writes

`atomicWriteSync(filePath, data)` in `src/utils.js`:

```js
const tmp = filePath + '.tmp';
fs.writeFileSync(tmp, data, 'utf-8');
fs.renameSync(tmp, filePath);   // atomic on same filesystem
```

`rename()` is atomic at the OS level on the same filesystem. This prevents the build process from reading a partial file if the fetch happens to write at the same moment.

---

## Static Output & Serving

### Astro Build

Astro is configured as a fully static site (`output: 'static'`). The `src/data/latest.json` file is read at build time in the Astro page frontmatter — no runtime data fetching, no server-side rendering.

```astro
---
// src/pages/index.astro — runs at BUILD TIME only
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('src/data/latest.json'));
const { articles, sitrep, developments, sourceStats } = raw;
---
<!-- HTML template uses the data above, baked in at build time -->
```

The generated `dist/` directory is served as plain static files by Express.

### Client-Side Behavior

Despite being fully static, the page has several client-side behaviors:

| Feature | Implementation |
|---------|---------------|
| Relative timestamps | `setInterval(refreshAllTimestamps, 30000)` re-computes "Xm ago" every 30s |
| LIVE / STALE pill | Updates color based on `data-generated-at` meta tag vs. `Date.now()` |
| Source filter | Pure JS DOM filtering — no page reload |
| Expandable cards | CSS `max-height` transition, toggled by click handler |
| "New updates" toast | `setTimeout(() => showToast(), UPDATE_TOAST_DELAY_MS)` — 1 hour |
| Back to top button | Shows after scrolling 500px |

### Cache Headers

Express sets:
- `dist/`: `maxAge: 5m` — browsers re-check after 5 minutes
- `data/`: `maxAge: 1m` — for archive page data fetches

---

## Daily Archive System

**Entry point**: `daily-summary.js`  
**Scheduled**: 23:55 daily via `com.war-dashboard.daily-summary` LaunchAgent

At end-of-day, a comprehensive summary is generated and saved to `data/daily/YYYY-MM-DD.json`.

The archive page (`src/pages/archive.astro`) is a purely client-side SPA that fetches from:
- `/api/archive/dates` — lists available dates
- `/api/archive/:date` — loads a specific day's briefing
- `/data/daily/manifest.json` — static fallback if API is unavailable

The archive renders a timeline of key events with collapsible descriptions, an escalation level badge, and prev/next day navigation.

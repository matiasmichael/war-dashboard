# CLAUDE.md — Middle East Pulse Dashboard

> Agent reference for AI working on this codebase. Read this before touching anything.

---

## Project Overview

**Middle East Pulse** is a live news intelligence dashboard tracking the Iran-Israel conflict theater. It aggregates RSS feeds from 8+ sources, synthesizes AI-powered intelligence briefings via Google Gemini, and serves a static Astro site via PM2 and Cloudflare Tunnel.

See the `docs/` directory for deep-dive technical documentation:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Pipeline internals, atomic writes, timestamp fixes
- [docs/FEEDS.md](docs/FEEDS.md) — RSS configurations, keyword filters, and quirks
- [docs/VIDEOS.md](docs/VIDEOS.md) — YouTube video pipeline
- [docs/I18N.md](docs/I18N.md) — Hebrew translation layer and RTL support

- **URL**: Public via Cloudflare Tunnel (configured at `~/.cloudflared/war-dashboard.yml`)
- **Port**: `8440` (Express serves `dist/`)
- **Stack**: Node.js + Astro + DaisyUI/Tailwind + Gemini API
- **Timezone**: All dates are anchored to `Asia/Jerusalem` (IDT/IST)

---

## Architecture — Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LAYER 1: DATA (every 3 min)                 │
│                                                                     │
│  RSS Feeds ──────┐                                                  │
│  (8 sources)     │                                                  │
│                  ▼                                                  │
│            src/fetcher.js                                           │
│            - Parallel fetch with retry (Promise.allSettled)         │
│            - JPost timezone correction (IDT→UTC)                    │
│            - Keyword filtering (CNBC, Fox, NPR, Al Jazeera)         │
│            - XML sanitization (Haaretz — disabled; still handles)   │
│                  │                                                  │
│                  ▼                                                  │
│            src/persistence.js                                       │
│            - Deduplicates by URL                                    │
│            - Refreshes mutable fields (title, snippet, date)        │
│            - Atomic writes to data/YYYY-MM-DD.json                  │
│                  │                                                  │
│                  ▼                                                  │
│            src/synthesize-developments.js                           │
│            - Picks top 25 articles → Gemini prompt                  │
│            - Returns 4 key developments (headline, summary, etc.)   │
│            - Saves to data/developments.json                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │  data/YYYY-MM-DD.json (articles)
                              │  data/developments.json
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      LAYER 2: AI SYNTHESIS (every 1 hr)             │
│                                                                     │
│            synthesize.js                                            │
│            - Reads data/YYYY-MM-DD.json (full day)                  │
│            - Calls src/synthesizer.js → Gemini                      │
│            - Generates sitrep: summary, top_updates, analysis       │
│            - Saves data/sitrep-latest.json                          │
│            - Saves data/last-sitrep.json (for delta framing)        │
│            - Triggers build.js                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │  data/sitrep-latest.json
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         LAYER 3: BUILD                              │
│                                                                     │
│            build.js                                                 │
│            - Reads data/YYYY-MM-DD.json (articles)                  │
│            - Reads data/sitrep-latest.json (sitrep)                 │
│            - Reads data/developments.json (key devs)                │
│            - Merges into src/data/latest.json                       │
│            - Runs `npx astro build` → dist/                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    dist/ (static HTML/CSS/JS)
                              │
                              ▼
                    server.js (Express on :8440)
                    + Cloudflare Tunnel → public URL
```

### LaunchAgent Schedule

| Agent | Interval | Script |
|-------|----------|--------|
| `com.war-dashboard.fetch-data` | every 3 min | `fetch-data.js` (Layer 1) |
| `com.war-dashboard.synthesize` | every 1 hr | `synthesize.js` (Layer 2 + build) |
| `com.war-dashboard.daily-summary` | daily at 23:55 | `daily-summary.js` |
| `com.war-dashboard.cloudflare-tunnel` | persistent | `cloudflared` |

---

## Directory Structure

```
war-dashboard/
│
├── fetch-data.js           Entry point: Layer 1. Fetch + persist + synthesize developments.
├── synthesize.js           Entry point: Layer 2. AI sitrep + triggers build.
├── build.js                Entry point: Layer 3. Assembles latest.json + runs Astro build.
├── fetch.js                Convenience wrapper: runs fetch-data.js → synthesize.js sequentially.
├── server.js               Express HTTP server. Serves dist/ on port 8440.
├── daily-summary.js        End-of-day aggregation script (runs at 23:55).
├── update.sh               Bash wrapper calling fetch.js (used by legacy LaunchAgent).
│
├── src/
│   ├── config.js           ★ Central config: ALL feeds, constants, magic numbers.
│   ├── fetcher.js          RSS fetching, JPost TZ correction, XML sanitization.
│   ├── synthesizer.js      Gemini sitrep synthesis (summary, top_updates, analysis).
│   ├── synthesize-developments.js  Gemini key-developments synthesis (4 items).
│   ├── persistence.js      Daily JSON deduplication + atomic writes.
│   ├── utils.js            CJS utilities: escapeHtml, timeAgo, atomicWriteSync, etc.
│   ├── shared-utils.js     ESM re-exports of utils.js (for Astro components). ⚠️ Keep in sync with utils.js.
│   ├── feeds.json          Feed metadata for Astro FilterBar (name, shortName, faviconDomain).
│   │
│   ├── data/
│   │   └── latest.json     ★ Astro's data source: articles + sitrep + developments.
│   │
│   ├── pages/
│   │   ├── index.astro     Main dashboard (articles, sitrep, key developments, filters).
│   │   ├── archive.astro   Daily briefing archive (fetches from /api/archive/*).
│   │   └── about.astro     About / How it works page.
│   │
│   ├── layouts/
│   │   └── Base.astro      HTML shell: DaisyUI basecamp theme, Manrope font.
│   │
│   ├── components/
│   │   ├── Header.astro    Sticky navbar: title, LIVE pill, archive icon.
│   │   ├── Footer.astro    Footer with attribution.
│   │   ├── SitrepCard.astro      Situation report card (collapsible).
│   │   ├── DevelopmentsGrid.astro  2-col grid of 4 key developments.
│   │   ├── ArticleCard.astro     Expandable article card with share.
│   │   └── FilterBar.astro       Source filter pills + article count.
│   │
│   └── styles/
│       └── global.css      DaisyUI basecamp theme, custom colors, live pill, scrollbar.
│
├── data/
│   ├── YYYY-MM-DD.json     Daily article archives (persisted by persistence.js).
│   ├── sitrep-latest.json  Most recent Gemini sitrep output.
│   ├── last-sitrep.json    Previous sitrep (for delta framing on next run).
│   ├── developments.json   Latest 4 key developments from Gemini.
│   └── daily/             End-of-day daily briefings (from daily-summary.js).
│       ├── manifest.json
│       └── YYYY-MM-DD.json
│
├── logs/
│   ├── fetch-data.log      stdout+stderr from fetch-data LaunchAgent.
│   └── synthesize.log      stdout+stderr from synthesize LaunchAgent.
│
├── dist/                   Astro build output (served by Express).
├── astro.config.mjs        Astro config: static output, Tailwind vite plugin.
├── package.json            Node deps: rss-parser, @google/generative-ai, astro, express.
└── tsconfig.json           TypeScript config (Astro uses TS for type checking).
```

---

## Key Design Decisions

### 0. Design System Rules

**Logos over Emojis:** Always use real publisher favicons/logos (via `getFaviconUrl(domain)`) for news sources, channels, and feeds. Do not use generic emojis for publishers.

```astro
// In Astro components:
function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
// Usage:
<img src={getFaviconUrl(feed.faviconDomain)} class="w-4 h-4 rounded-sm" alt="" />
```

This applies to: article feed filter buttons (`FilterBar.astro`), video channel filter buttons and badges (`videos.astro`), and any future publisher-branded UI elements.

### 1. Decoupled 3-Layer Pipeline
**Why**: Fetch (3 min) and synthesize (1 hr) run on completely independent schedules.
- Fetching more often keeps articles fresh without burning Gemini quota.
- The synthesizer reads the full day's accumulated articles, giving Gemini more context.
- Build is triggered by synthesize.js — or can be run standalone after a code change.
- If Gemini fails, articles still display; the sitrep just shows a warning.

### 2. Static Site Generation (No Client-Side API Calls)
**Why**: All data is baked into `src/data/latest.json` at build time. The browser gets pure HTML — no polling, no API keys in the client, no hydration latency. The "live" feel comes from the page freshness label and a reload toast after 1 hour.

### 3. JPost Timezone Correction
**Root cause**: Jerusalem Post RSS stamps all `pubDate` values in Israel local time (IDT = UTC+3 in summer, IST = UTC+2 in winter) but incorrectly labels them as `GMT`. This makes articles appear 2–3 hours in the future.

**Fix**: `correctJPostTimezone()` in `src/fetcher.js` uses `Intl.DateTimeFormat` to determine the Israel UTC offset for any given timestamp (DST-aware), then subtracts it from the mislabeled timestamp. See `docs/ARCHITECTURE.md` for full details.

```
RSS says: "Sat, 11 Apr 2026 21:18:16 GMT"  (mislabeled — actually 21:18 IDT)
Israel offset on that date: +180 min (IDT = UTC+3)
True UTC: 21:18 − 3h = 18:18 UTC  ✓
```

### 4. Future-Date Article Handling
JPost also pre-schedules articles in RSS before they go live. After timezone correction, any article still in the future beyond a 30-minute tolerance window is dropped with a log message. Previously these were clamped to `now`, which caused ordering issues.

### 5. Atomic Writes
All JSON writes use `atomicWriteSync()` (write to `.tmp` then `rename`). This prevents partial reads if the process crashes mid-write — important since the same files are read by the build process which can run concurrently.

### 6. Haaretz Is Disabled
Haaretz's RSS endpoint (`haaretz.com/cmlink/1.4478498`) returns a full 1.3 MB HTML paywall page to all non-whitelisted user agents. The feed is defined in `FEEDS` with `disabled: true`. The filter bar still shows "Haaretz" to users because `src/feeds.json` is the Astro-facing source; update it too if re-enabling.

### 7. CNN is Dead (As of ~2024)
CNN's feed was removed from active feeds. The old `cnnTitleFix` logic and `dropNoDate` flags remain in the codebase as historical code comments, but CNN no longer has a valid RSS endpoint that returns real content. **Do not re-add CNN as a primary feed.** Their feed returns stale section-navigation links.

### 8. Deduplication with Field Refresh
Articles are deduplicated by URL (link field). But on each fetch, mutable fields — `title`, `snippet`, `date` — are refreshed from the latest RSS data. This handles publishers who fix typos, update headlines, or correct timestamps post-publication.

### 9. Gemini API Key Source
The `GOOGLE_API_KEY` is read from `~/.openclaw/openclaw.json` (OpenClaw gateway config), not from a `.env` file. The centralized `getGeminiKey()` in `src/config.js` validates that both the config file and the key exist, throwing a clear error if either is missing.

### 10. Dual Utils (CJS + ESM)
`src/utils.js` is CJS (for Node scripts). `src/shared-utils.js` is ESM (for Astro components). They have overlapping functions — Astro's bundler cannot resolve CJS `module.exports` as ESM named imports. **If you change a function in one, update the other.** Both files have sync-warning headers. See `docs/I18N.md` for why this split exists.

---

## How to Add a New RSS Feed

1. **Edit `src/config.js`** — add a new entry to the `FEEDS` array:

```js
{
  name: 'Reuters',           // Full display name
  shortName: 'Reuters',      // Short name for filter bar
  url: 'https://feeds.reuters.com/reuters/worldNews',
  emoji: '📡',               // Emoji used as article logo
  faviconDomain: 'reuters.com',  // Used for Google Favicon API
  color: '#ff6600',          // Article card accent color (hex)
  accentLight: '#fff8f0',    // Card background tint
  keywords: null,            // null = accept all articles; array = filter by keyword
  staleThresholdHours: null, // null = no stale filter; number = drop older articles
  // Optional flags:
  // sanitizeXml: true       — pre-sanitize malformed XML (unescaped & etc.)
  // fixFutureDates: true    — apply JPost-style timezone correction
  // disabled: true          — skip this feed but keep in config
}
```

2. **Edit `src/feeds.json`** — add the feed's metadata for the Astro filter bar:

```json
{
  "name": "Reuters",
  "shortName": "Reuters",
  "faviconDomain": "reuters.com"
}
```

3. **Run a manual test** to confirm it fetches:

```bash
node fetch-data.js
```

Check the output for `✓ Reuters: N articles` or errors.

---

## How to Modify the Sitrep Prompt

Edit `src/synthesizer.js`, function `synthesizeReport()`. The prompt is inline ~100 lines in.

Key sections to know:
- **Summary rules**: 40-word hard limit, no temporal hedging, `<strong>` only for HTML emphasis.
- **Top updates**: 3 items, max 12-word headlines, relative time strings.
- **Analysis rules**: 3–5 sentences, max 80 words, covers force posture + proxy + nuclear + watch item.
- **Delta framing**: If `last-sitrep.json` exists, the previous briefing is passed in context for the `detailed_analysis` field only (not summary).

After editing, test with:
```bash
node synthesize.js
```

---

## How to Modify the Developments Synthesis

Edit `src/synthesize-developments.js`, function `synthesizeDevelopments()`. The prompt is in the middle of that function.

Key prompt rules:
- Returns exactly **4 developments** with `headline`, `summary`, `sources`, `severity`, `category`.
- `severity`: `critical | major | notable | developing`
- `category`: `military | diplomacy | humanitarian | economic`
- Scope: Iran, Israel, proxies (Hezbollah, Hamas, Houthis, IRGC), nuclear, regional escalation.

---

## Common Pitfalls

### JPost Timezone Confusion
If you see JPost articles appearing 2–3 hours in the future, the `correctJPostTimezone()` fix may need revisiting. The offset logic uses `Intl.DateTimeFormat` to detect IDT vs IST automatically. Check by running `node test-jpost.js`.

### Haaretz Keeps Getting Re-Added
Don't. Their endpoint has been broken for years (returns an HTML paywall page). If someone insists, they need to find a valid RSS URL behind a subscription cookie, then test it with `sanitizeXml: true`.

### CNN Feed Is Empty/Stale
CNN RSS feeds (`rss.cnn.com`) were effectively abandoned ~2024. Their remaining feeds return either section nav links or articles frozen from 2024. CNBC is a better substitute for US financial/policy coverage of the region.

### Build Fails After Code Change
If you edit Astro components or CSS, you need to rebuild:
```bash
node build.js
pm2 restart war-dashboard
```
The server serves `dist/` — it doesn't hot-reload.

### Gemini Returns Markdown Instead of JSON
The Gemini model sometimes wraps JSON in ` ```json ``` ` fences despite being told not to. Both synthesizer and synthesize-developments have a cleanup step:
```js
textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
```
If it's still failing, add a `console.log(textOutput)` before the `JSON.parse()` to inspect the raw output.

### `src/data/latest.json` Is Stale or Missing
If the homepage shows old data or the build fails with "No data file for today", check:
1. `data/2026-04-XX.json` exists for today (Israel date).
2. `data/sitrep-latest.json` exists.
3. Run `node build.js` manually — it will log what it found/missed.

### Future Articles Float to Top
After a timezone fix deployment, old articles stored with bad future timestamps may still exist in `data/YYYY-MM-DD.json`. The persistence layer clamps lingering future timestamps to `now` on every fetch. Run `node fetch-data.js` once to force the clamp.

---

## Environment Requirements

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 18 | Uses built-in `fetch`, `Intl.DateTimeFormat` |
| `GOOGLE_API_KEY` | In `~/.openclaw/openclaw.json` → `env.GOOGLE_API_KEY` |
| PM2 | Process manager: `pm2 start server.js --name war-dashboard` |
| Cloudflare Tunnel | `cloudflared` via LaunchAgent; config at `~/.cloudflared/war-dashboard.yml` |
| macOS LaunchAgents | Plist files in `~/Library/LaunchAgents/com.war-dashboard.*` |

---

## Commands Cheat Sheet

```bash
# ── Data & Build ──────────────────────────────────────────────────
node fetch-data.js          # Layer 1: fetch RSS + synthesize developments
node synthesize.js          # Layer 2: AI sitrep + build
node build.js               # Layer 3: assemble latest.json + Astro build only
node fetch.js               # Full pipeline (all 3 layers) — manual use

# ── Dev Server ────────────────────────────────────────────────────
node server.js              # Start Express server on :8440
npm run dev                 # Astro dev server (hot reload, for UI work only)

# ── PM2 ───────────────────────────────────────────────────────────
pm2 start server.js --name war-dashboard
pm2 restart war-dashboard
pm2 stop war-dashboard
pm2 logs war-dashboard

# ── LaunchAgents ─────────────────────────────────────────────────
launchctl load   ~/Library/LaunchAgents/com.war-dashboard.fetch-data.plist
launchctl unload ~/Library/LaunchAgents/com.war-dashboard.fetch-data.plist
launchctl list | grep war-dashboard

# ── Logs ──────────────────────────────────────────────────────────
tail -f logs/fetch-data.log
tail -f logs/synthesize.log
tail -f ~/Library/Logs/war-dashboard-tunnel.log

# ── One-off Diagnosis ────────────────────────────────────────────
node test-jpost.js          # Test JPost timezone correction
curl localhost:8440/health  # Server health check
curl localhost:8440/api/archive/dates  # List available daily briefings
```

---

## Gemini Prompt Outputs

### Sitrep (`data/sitrep-latest.json`)
```json
{
  "summary": "HTML string with <strong> tags",
  "top_updates": [
    { "headline": "Short headline", "source": "BBC", "time": "2h ago" }
  ],
  "detailed_analysis": "HTML string with <strong> tags",
  "generatedAt": "ISO timestamp",
  "articleCount": 125
}
```

### Developments (`data/developments.json`)
```json
{
  "developments": [
    {
      "headline": "5-8 word punchy headline",
      "summary": "1-2 sentences, max 40 words",
      "sources": ["BBC", "Times of Israel"],
      "severity": "critical|major|notable|developing",
      "category": "military|diplomacy|humanitarian|economic",
      "updatedAt": "ISO timestamp"
    }
  ],
  "generatedAt": "ISO timestamp",
  "articleCount": 125
}
```

---

## Notes for Future AI Agents

- The project root is `/Users/michaelmatias/Projects/war-dashboard/`
- `package.json` sets `"type": "commonjs"` — all Node scripts use `require()`, not `import`
- Astro pages use ESM (`import`/`export`) because Astro handles the CJS/ESM boundary
- The theme is `basecamp` (DaisyUI custom theme). Header is `bg-header-brown` (#4A3728). 
  Do not change the color scheme without reading `src/styles/global.css` first.
- `src/data/latest.json` is gitignored (it's build output). Don't commit it.
- `data/*.json` are also gitignored (live data). Don't commit them.
- After ANY change to Astro components, CSS, or `build.js`, run `node build.js && pm2 restart war-dashboard`.

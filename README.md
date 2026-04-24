# 🔶 Middle East Pulse

A live intelligence dashboard tracking the Iran-Israel conflict theater. Aggregates 8+ RSS feeds, synthesizes AI-powered briefings via Google Gemini, and serves a static Astro site updated every 3 minutes.

![DaisyUI](https://img.shields.io/badge/DaisyUI-5.x-orange) ![Astro](https://img.shields.io/badge/Astro-6.x-purple) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Gemini](https://img.shields.io/badge/Gemini-2.5--flash-blue)

---

## Features

- **Live RSS aggregation** from 8 major sources (Ynet, BBC, Al Jazeera, Times of Israel, Jerusalem Post, Fox News, CNBC, NPR)
- **AI situation report** — Gemini synthesizes a military-style intelligence briefing every hour
- **Key Developments** — 4 most significant events identified and ranked by severity
- **Daily briefing archive** — end-of-day summaries with timeline view
- **Source filter bar** — filter articles by outlet
- **Static site** — no client-side API calls, no hydration latency
- **Cloudflare Tunnel** — publicly accessible without port forwarding

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Google AI API key (`GOOGLE_API_KEY`) stored in `~/.openclaw/openclaw.json`
- PM2 (`npm install -g pm2`)
- Cloudflare `cloudflared` (optional, for public access)

### Install & Run

```bash
# Clone and install
git clone <repo>
cd war-dashboard
npm install

# Fetch data and build the site (full pipeline)
node fetch.js

# Start the server
pm2 start server.js --name war-dashboard
```

The site is now live at `http://localhost:8440`.

### Manual Pipeline Steps

```bash
node fetch-data.js    # Fetch RSS feeds + synthesize key developments
node synthesize.js    # Generate AI sitrep + rebuild site
node build.js         # Rebuild site only (no fetch, no AI)
```

---

## Architecture Overview

The pipeline runs in 3 independent layers:

```
RSS Feeds (8 sources)
      │
      ▼  [every 3 min]
fetch-data.js  ──→  data/YYYY-MM-DD.json
                    data/developments.json
      │
      ▼  [every 1 hr]
synthesize.js  ──→  data/sitrep-latest.json
      │
      ▼
build.js  ──→  src/data/latest.json  ──→  Astro build  ──→  dist/
                                                                │
                                                         server.js :8440
```

**Key design principles:**
- Fetch and synthesize run on independent schedules — no wasted Gemini calls on every fetch
- All data is baked into the static site at build time — no client-side API calls
- Atomic file writes prevent corruption during concurrent operations
- Gemini failures are non-fatal — articles still display without the sitrep

For a detailed technical reference, see:
- [CLAUDE.md](./CLAUDE.md) — Main agent reference
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Pipeline and build logic
- [docs/FEEDS.md](./docs/FEEDS.md) — RSS sources and configuration
- [docs/VIDEOS.md](./docs/VIDEOS.md) — YouTube video pipeline
- [docs/I18N.md](./docs/I18N.md) — Hebrew translation and RTL support

---

## Configuration

### Feed Configuration (`src/config.js`)

All feeds are defined in the `FEEDS` array in `src/config.js`. Each feed supports:

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Full display name |
| `shortName` | string | Short name for filter bar |
| `url` | string | RSS feed URL |
| `emoji` | string | Article logo emoji |
| `faviconDomain` | string | Domain for Google Favicon API |
| `color` | hex | Article card accent color |
| `accentLight` | hex | Card background tint |
| `keywords` | `string[] \| null` | Filter to articles matching any keyword; `null` = accept all |
| `staleThresholdHours` | `number \| null` | Drop articles older than N hours; `null` = no limit |
| `disabled` | boolean | Skip feed entirely (keeps entry in config) |
| `fixFutureDates` | boolean | Apply JPost timezone correction (IDT mislabeled as GMT) |
| `sanitizeXml` | boolean | Pre-sanitize malformed XML before parsing |

### Adding a Feed

1. Add entry to `FEEDS` in `src/config.js`
2. Add matching entry to `src/feeds.json` (for filter bar)
3. Run `node fetch-data.js` to test

### Key Constants (`src/config.js`)

| Constant | Default | Description |
|----------|---------|-------------|
| `MAX_ARTICLES_PER_SOURCE` | 15 | Max articles taken per feed per cycle |
| `MAX_ARTICLES_FOR_SYNTHESIS` | 25 | Articles sent to Gemini |
| `STALE_THRESHOLD_HOURS` | 48 | Default stale cutoff |
| `RSS_TIMEOUT_MS` | 15000 | Feed fetch timeout |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use |
| `PORT` | 8440 | Express server port |
| `TIMEZONE` | `Asia/Jerusalem` | Date anchoring timezone |

### API Key

The `GOOGLE_API_KEY` is read from `~/.openclaw/openclaw.json`:

```json
{
  "env": {
    "GOOGLE_API_KEY": "your-key-here"
  }
}
```

---

## Deployment

### PM2 (Process Manager)

```bash
pm2 start server.js --name war-dashboard
pm2 save                    # Persist across reboots
pm2 startup                 # Configure PM2 to start on boot
```

### LaunchAgents (macOS Automation)

The following LaunchAgents run the pipeline automatically:

| Plist | Schedule | Purpose |
|-------|----------|---------|
| `com.war-dashboard.fetch-data.plist` | Every 3 min | Fetch RSS + synthesize developments |
| `com.war-dashboard.synthesize.plist` | Every 1 hr | AI sitrep + rebuild site |
| `com.war-dashboard.daily-summary.plist` | 23:55 daily | End-of-day briefing |
| `com.war-dashboard.cloudflare-tunnel.plist` | Persistent | Cloudflare Tunnel |

Load/unload a LaunchAgent:
```bash
launchctl load   ~/Library/LaunchAgents/com.war-dashboard.fetch-data.plist
launchctl unload ~/Library/LaunchAgents/com.war-dashboard.fetch-data.plist
```

### Cloudflare Tunnel

The tunnel config lives at `~/.cloudflared/war-dashboard.yml`. It proxies the public URL to `localhost:8440`. The tunnel process is managed by its own LaunchAgent and starts automatically on login.

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Live dashboard: sitrep, key developments, article feed |
| `/archive` | Daily briefing archive with timeline view |
| `/about` | How it works, sources, disclaimer |

---

## Logs

```bash
tail -f logs/fetch-data.log     # Layer 1 (fetch + developments)
tail -f logs/synthesize.log     # Layer 2 (sitrep + build)
tail -f ~/Library/Logs/war-dashboard-tunnel.log   # Cloudflare tunnel
```

---

## Known Limitations

- **Haaretz**: Disabled. Their RSS returns an HTML paywall page to all non-whitelisted agents.
- **CNN**: Removed. Their RSS feeds were abandoned ~2024 and return stale section nav links.
- **JPost timezone**: Their RSS incorrectly labels IDT timestamps as GMT. Fixed automatically via `correctJPostTimezone()` in `src/fetcher.js`.
- **Static site**: The page doesn't auto-refresh. A "New updates available" toast appears after 1 hour to prompt a manual reload.

---

## Development

```bash
npm run dev     # Astro dev server with hot reload (for UI work)
npm run build   # Raw Astro build (use node build.js for full pipeline)
npm run check   # TypeScript type check
```

> **Note**: After any UI change, run `node build.js && pm2 restart war-dashboard` to update the live site.

---

## License

ISC

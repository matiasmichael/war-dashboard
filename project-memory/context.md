# MEP Dashboard — Living Context

## Infrastructure Ownership
- **Uptime monitoring:** Infra owns `com.bodhi.service-watchdog` LaunchAgent. Monitors port 8440, alerts and auto-restarts the `mepulse` PM2 process if it goes down. MEP does NOT need to worry about uptime.
- **App-level health check:** MEP owns `com.mep-dashboard.health-check` LaunchAgent. Runs `~/Projects/war-dashboard/health-check.js` every hour. This is data-quality / pipeline health (not uptime). If it breaks or needs changes, MEP handles it.
  - A duplicate `com.war-dashboard.health-check` plist was retired by Infra.

## health-check.js Overview
Runs 6 checks in parallel, saves JSON report to `data/health/YYYY-MM-DD-HH.json`:
1. `site_availability` — HTTP GET mep.hmviva.us/, /about, /archive; fail if non-200, warn if >3s
2. `data_freshness` — today's `data/YYYY-MM-DD.json` exists, newest article <15min old, ≥6 sources active
3. `timestamp_integrity` — no future-dated articles, no clamping-bug clusters (5+ identical timestamps), JPost TZ offset check
4. `synthesis_health` — `data/developments.json` <15min old & has 4 entries; `data/sitrep-latest.json` <75min old (synthesizer is hourly, 15min grace)
5. `build_health` — `src/data/latest.json` <15min old, `dist/index.html` exists, PM2 war-dashboard is online
6. `ui_smoke` — fetches mep.hmviva.us/, checks for "Middle East Pulse", "SITUATION REPORT", "Key Developments", ≥3 article-cards, LIVE pill, no bare undefined/null in HTML

Exit codes: 0=healthy, 1=degraded (warn), 2=critical (fail), 3=crashed

## Stack & Process
- URL: mepulse.co (port 8440)
- PM2 process name: war-dashboard
- Cloudflare Tunnel active
- Node/Express + Astro + DaisyUI/Tailwind + Google Gemini API

## Known Gotchas
- `src/data/latest.json` is build output — never commit it
- `data/*.json` are live pipeline data — never commit them
- JPost timestamps have historically been 3h ahead (TZ bug) — fetcher.js has correction logic; health check monitors for regression
- Haaretz disabled, CNN removed from feed sources (check `src/config.js` for current active list)
- source list in health-check.js `checkDataFreshness()` still references old sources (Haaretz, CNN) in `ALL_SOURCES` — these will always show as zero-article sources; not a bug, just stale reference data in the check

## Key Contacts
- Infra Bodhi: owns uptime monitoring, ports, Cloudflare, PM2, LaunchAgents (except MEP's health-check)
- MEP Bodhi (me): owns everything inside ~/Projects/war-dashboard/

# MEP Dashboard — Decision Log

---

## 2026-04-19 — Health Check Ownership Transfer

**Decision:** MEP Bodhi owns `com.mep-dashboard.health-check` LaunchAgent going forward.

**Context:** Infra Bodhi is consolidating monitoring ownership. Infra retains uptime monitoring via `com.bodhi.service-watchdog` (port 8440 down → alert + PM2 restart). App-level data-quality health check (`health-check.js`) transferred to MEP ownership.

**Reasoning:** health-check.js is tightly coupled to app internals — it knows about developments.json, sitrep-latest.json, article freshness thresholds, JPost TZ bugs, source counts, etc. MEP is better positioned to maintain and evolve it as the app changes.

**Alternatives rejected:** Keeping it in Infra's domain would mean Infra needs to track MEP-specific data schema changes — bad coupling.

**Impact:** If health-check.js breaks, errors out, or needs threshold changes, MEP handles it. Infra handles if the LaunchAgent itself won't load (OS-level plist issue).

**Also retired:** Duplicate `com.war-dashboard.health-check` plist cleaned up by Infra.

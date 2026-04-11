#!/usr/bin/env node
/**
 * MEP Dashboard — Twice-Daily Health Check
 * Runs at 08:00 and 20:00 Israel time (05:00 / 17:00 UTC)
 * Saves report to data/health/YYYY-MM-DD-HH.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http  = require('http');
const https = require('https');

const ROOT = path.join(__dirname);

// ── helpers ──────────────────────────────────────────────────────────────────

function httpGet(url, timeoutMs = 10000, followRedirects = false) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const t0  = Date.now();
    const req = lib.get(url, { headers: { 'User-Agent': 'MEP-HealthCheck/1.0' } }, (res) => {
      // Follow redirects transparently when requested
      if (followRedirects && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        // Resolve relative redirect URLs against the base
        let location = res.headers.location;
        if (!location.startsWith('http')) {
          const base = new URL(url);
          location = base.origin + (location.startsWith('/') ? location : '/' + location);
        }
        httpGet(location, timeoutMs, false)
          .then(r => resolve({ ...r, ms: Date.now() - t0, redirectedFrom: url }))
          .catch(reject);
        return;
      }
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () =>
        resolve({ status: res.statusCode, body, ms: Date.now() - t0 })
      );
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
  });
}

function fileMtimeMs(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return null; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function todayDate() {
  // Israel time: UTC+3 (standard) — use simple offset for date calculation
  const now = new Date();
  const israelMs = now.getTime() + (3 * 60 * 60 * 1000);
  const d = new Date(israelMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function nowMs() { return Date.now(); }
const MIN = 60 * 1000;

// ── check runners ─────────────────────────────────────────────────────────────

async function checkSiteAvailability() {
  const urls = [
    'https://mep.hmviva.us/',
    'https://mep.hmviva.us/about',
    'https://mep.hmviva.us/archive',
  ];

  const results = [];
  let anyFail = false;
  let anyWarn = false;

  for (const url of urls) {
    try {
      // Follow redirects so /about → /about/ (301) counts as a pass
      const res = await httpGet(url, 10000, true);
      const ok   = res.status === 200;
      const slow = res.ms > 3000;
      const s    = !ok ? 'fail' : slow ? 'warn' : 'pass';
      if (s === 'fail') anyFail = true;
      if (s === 'warn') anyWarn = true;
      const redirectNote = res.redirectedFrom ? ' (redirected)' : '';
      results.push({ url, httpStatus: res.status, ms: res.ms, status: s, redirectNote });
    } catch (e) {
      anyFail = true;
      results.push({ url, error: e.message, status: 'fail' });
    }
  }

  return {
    name:   'site_availability',
    status: anyFail ? 'fail' : anyWarn ? 'warn' : 'pass',
    detail: results.map(r =>
      r.error
        ? `${r.url} → ERROR: ${r.error}`
        : `${r.url} → ${r.httpStatus}${r.redirectNote || ''} (${r.ms}ms)`
    ).join(' | '),
    raw: results,
  };
}

async function checkDataFreshness() {
  const today    = todayDate();
  const filePath = path.join(ROOT, 'data', `${today}.json`);
  const issues   = [];
  const info     = [];

  if (!fs.existsSync(filePath)) {
    return {
      name:   'data_freshness',
      status: 'fail',
      detail: `Today's data file not found: data/${today}.json`,
    };
  }

  const articles = readJson(filePath);
  if (!Array.isArray(articles)) {
    return {
      name:   'data_freshness',
      status: 'fail',
      detail: `data/${today}.json is not a valid array`,
    };
  }

  // Newest article age
  const now       = nowMs();
  const dates     = articles.map(a => new Date(a.date).getTime()).filter(t => !isNaN(t));
  const newestMs  = dates.length ? Math.max(...dates) : 0;
  const ageMins   = newestMs ? ((now - newestMs) / MIN).toFixed(1) : '∞';
  const freshOk   = newestMs && (now - newestMs) < 15 * MIN;

  if (!freshOk) {
    issues.push(`Newest article is ${ageMins} min old (threshold: 15 min)`);
  } else {
    info.push(`Newest article: ${ageMins} min ago`);
  }

  // Source coverage
  const ALL_SOURCES = ['Ynet News', 'Haaretz', 'CNN', 'Fox News', 'BBC News', 'Al Jazeera', 'NPR', 'Times of Israel', 'Jerusalem Post', 'CNBC'];
  const sourceCounts = {};
  for (const a of articles) {
    const s = a.source || 'unknown';
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }
  const activeSources   = Object.keys(sourceCounts).filter(s => sourceCounts[s] > 0);
  const zeroSources     = ALL_SOURCES.filter(s => !sourceCounts[s]);
  const sourceCountPass = activeSources.length >= 6;

  if (!sourceCountPass) {
    issues.push(`Only ${activeSources.length}/8+ sources active (need ≥6): ${activeSources.join(', ')}`);
  } else {
    info.push(`${activeSources.length} sources active`);
  }

  if (zeroSources.length) {
    issues.push(`Zero articles from: ${zeroSources.join(', ')}`);
  }

  info.push(`Total articles today: ${articles.length}`);

  const status = issues.length
    ? (freshOk && sourceCountPass ? 'warn' : 'fail')
    : 'pass';

  return {
    name:   'data_freshness',
    status,
    detail: [...info, ...issues].join(' | '),
    raw:    { today, articleCount: articles.length, activeSources, zeroSources, newestAgeMinutes: parseFloat(ageMins) },
  };
}

async function checkTimestampIntegrity() {
  const today    = todayDate();
  const filePath = path.join(ROOT, 'data', `${today}.json`);
  const issues   = [];
  const info     = [];

  if (!fs.existsSync(filePath)) {
    return { name: 'timestamp_integrity', status: 'warn', detail: `Today's data file not found` };
  }

  const articles = readJson(filePath);
  if (!Array.isArray(articles)) {
    return { name: 'timestamp_integrity', status: 'warn', detail: 'Invalid articles array' };
  }

  const now = nowMs();

  // Future-dated timestamps (>5 min ahead)
  const futureDated = articles.filter(a => {
    const t = new Date(a.date).getTime();
    return !isNaN(t) && t > now + 5 * MIN;
  });
  if (futureDated.length) {
    issues.push(`${futureDated.length} article(s) with future timestamps: ${futureDated.map(a => `"${a.title?.substring(0,30)}" @${a.date}`).join('; ')}`);
  } else {
    info.push('No future-dated timestamps');
  }

  // Clustered timestamps (clamping bug: 5+ identical timestamps)
  const tsBuckets = {};
  for (const a of articles) {
    const t = a.date || '';
    if (t) tsBuckets[t] = (tsBuckets[t] || 0) + 1;
  }
  const clustered = Object.entries(tsBuckets).filter(([, c]) => c >= 5);
  if (clustered.length) {
    issues.push(`Clamping-bug clusters (5+ identical timestamps): ${clustered.map(([ts, c]) => `${ts}×${c}`).join(', ')}`);
  } else {
    info.push('No clamping-bug clusters');
  }

  // JPost timezone check: JPost articles should NOT be 3h ahead of other articles
  const jpostArticles = articles.filter(a => a.source === 'Jerusalem Post');
  const otherArticles = articles.filter(a => a.source !== 'Jerusalem Post' && a.source !== 'Ynet News');
  if (jpostArticles.length && otherArticles.length) {
    const jpostTimes = jpostArticles.map(a => new Date(a.date).getTime()).filter(t => !isNaN(t));
    const otherTimes = otherArticles.map(a => new Date(a.date).getTime()).filter(t => !isNaN(t));
    if (jpostTimes.length && otherTimes.length) {
      const jpostAvg  = jpostTimes.reduce((a, b) => a + b, 0) / jpostTimes.length;
      const otherAvg  = otherTimes.reduce((a, b) => a + b, 0) / otherTimes.length;
      const diffHours = (jpostAvg - otherAvg) / (60 * 60 * 1000);
      if (diffHours > 2.5 && diffHours < 3.5) {
        issues.push(`JPost timestamps appear to be ~3h ahead of other sources (diff: ${diffHours.toFixed(2)}h) — timezone bug may be active`);
      } else {
        info.push(`JPost timezone offset vs others: ${diffHours.toFixed(2)}h (OK)`);
      }
    }
  }

  const status = issues.length ? 'warn' : 'pass';
  return {
    name:   'timestamp_integrity',
    status,
    detail: [...info, ...issues].join(' | '),
    raw:    { futureDated: futureDated.length, clustered },
  };
}

async function checkSynthesisHealth() {
  const issues = [];
  const info   = [];
  const now    = nowMs();

  // developments.json
  const devPath    = path.join(ROOT, 'data', 'developments.json');
  const devMtime   = fileMtimeMs(devPath);
  const devData    = readJson(devPath);
  const devAgeMins = devMtime ? ((now - devMtime) / MIN).toFixed(1) : null;

  if (!devMtime) {
    issues.push('data/developments.json does not exist');
  } else if ((now - devMtime) > 15 * MIN) {
    issues.push(`data/developments.json is ${devAgeMins} min old (threshold: 15 min)`);
  } else {
    info.push(`developments.json: ${devAgeMins} min old`);
  }

  if (devData) {
    const devs = devData.developments || devData;
    const count = Array.isArray(devs) ? devs.length : 0;
    if (count !== 4) {
      issues.push(`developments has ${count} entries (expected 4)`);
    } else {
      info.push(`developments: ${count} entries ✓`);
    }
  } else if (devMtime) {
    issues.push('data/developments.json is not valid JSON');
  }

  // sitrep-latest.json — synthesizer runs hourly, so threshold is 75 min (1h + 15 min grace)
  const sitrepPath    = path.join(ROOT, 'data', 'sitrep-latest.json');
  const sitrepMtime   = fileMtimeMs(sitrepPath);
  const sitrepData    = readJson(sitrepPath);
  const sitrepAgeMins = sitrepMtime ? ((now - sitrepMtime) / MIN).toFixed(1) : null;
  const SITREP_THRESHOLD_MINS = 75; // synthesizer is hourly; allow 15 min grace

  if (!sitrepMtime) {
    issues.push('data/sitrep-latest.json does not exist');
  } else if ((now - sitrepMtime) > SITREP_THRESHOLD_MINS * MIN) {
    issues.push(`data/sitrep-latest.json is ${sitrepAgeMins} min old (threshold: ${SITREP_THRESHOLD_MINS} min — synthesizer runs hourly)`);
  } else {
    info.push(`sitrep-latest.json: ${sitrepAgeMins} min old`);
  }

  if (sitrepData) {
    const hasSummary = sitrepData.summary && sitrepData.summary.trim().length > 20;
    if (!hasSummary) {
      issues.push('sitrep summary is empty or too short');
    } else {
      info.push('sitrep summary: present ✓');
    }
  } else if (sitrepMtime) {
    issues.push('data/sitrep-latest.json is not valid JSON');
  }

  const status = issues.length
    ? (devMtime && sitrepMtime ? 'warn' : 'fail')
    : 'pass';

  return {
    name:   'synthesis_health',
    status,
    detail: [...info, ...issues].join(' | '),
    raw:    { developmentsAgeMins: devAgeMins ? parseFloat(devAgeMins) : null, sitrepAgeMins: sitrepAgeMins ? parseFloat(sitrepAgeMins) : null },
  };
}

async function checkBuildHealth() {
  const issues = [];
  const info   = [];
  const now    = nowMs();

  // src/data/latest.json
  const latestPath    = path.join(ROOT, 'src', 'data', 'latest.json');
  const latestMtime   = fileMtimeMs(latestPath);
  const latestAgeMins = latestMtime ? ((now - latestMtime) / MIN).toFixed(1) : null;

  if (!latestMtime) {
    issues.push('src/data/latest.json does not exist');
  } else if ((now - latestMtime) > 15 * MIN) {
    issues.push(`src/data/latest.json is ${latestAgeMins} min old (threshold: 15 min)`);
  } else {
    info.push(`src/data/latest.json: ${latestAgeMins} min old`);
  }

  // dist/index.html
  const distPath = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distPath)) {
    issues.push('dist/index.html does not exist — build may have failed');
  } else {
    info.push('dist/index.html: exists ✓');
  }

  // PM2 war-dashboard process
  try {
    const { execSync } = require('child_process');
    const pm2Raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const pm2List = JSON.parse(pm2Raw);
    const proc = pm2List.find(p => p.name === 'war-dashboard');
    if (!proc) {
      issues.push('PM2 process "war-dashboard" not found');
    } else {
      const s = proc.pm2_env?.status;
      if (s !== 'online') {
        issues.push(`PM2 "war-dashboard" status: ${s} (expected: online)`);
      } else {
        const restarts = proc.pm2_env?.restart_time || 0;
        if (restarts > 50) {
          issues.push(`PM2 "war-dashboard" has ${restarts} restarts — possible crash-loop`);
        } else {
          info.push(`PM2 war-dashboard: online (${restarts} restarts)`);
        }
      }
    }
  } catch (e) {
    issues.push(`PM2 check failed: ${e.message}`);
  }

  const status = issues.length ? (fs.existsSync(path.join(ROOT, 'dist', 'index.html')) ? 'warn' : 'fail') : 'pass';

  return {
    name:   'build_health',
    status,
    detail: [...info, ...issues].join(' | '),
    raw:    { latestJsonAgeMins: latestAgeMins ? parseFloat(latestAgeMins) : null },
  };
}

async function checkUiSmoke() {
  const issues = [];
  const info   = [];

  let html;
  try {
    const { body, status, ms } = await httpGet('https://mep.hmviva.us/', 15000);
    if (status !== 200) {
      return { name: 'ui_smoke', status: 'fail', detail: `Homepage returned HTTP ${status}` };
    }
    html = body;
    info.push(`Fetched homepage in ${ms}ms`);
  } catch (e) {
    return { name: 'ui_smoke', status: 'fail', detail: `Failed to fetch homepage: ${e.message}` };
  }

  // Required strings
  const required = [
    { label: 'Site title "Middle East Pulse"',  pattern: /Middle East Pulse/i },
    { label: '"SITUATION REPORT" section',       pattern: /SITUATION REPORT/i },
    { label: '"Key Developments" section',       pattern: /Key Developments/i },
  ];
  for (const { label, pattern } of required) {
    if (!pattern.test(html)) {
      issues.push(`Missing: ${label}`);
    } else {
      info.push(`✓ ${label}`);
    }
  }

  // Article cards
  const cardMatches = (html.match(/article-card/g) || []).length;
  if (cardMatches < 3) {
    issues.push(`Only ${cardMatches} article-card divs found (need ≥3) — possible empty feed`);
  } else {
    info.push(`article-card count: ${cardMatches} ✓`);
  }

  // "undefined" / "null" in card titles
  // Look for card title regions — simple heuristic: check for >undefined< or >null< in html
  const undefinedInTitle = />\s*(undefined|null)\s*</.test(html);
  if (undefinedInTitle) {
    issues.push('Found "undefined" or "null" in rendered HTML — possible data hydration error');
  } else {
    info.push('No bare undefined/null values in HTML ✓');
  }

  // LIVE pill
  const hasLivePill = /LIVE/i.test(html);
  if (!hasLivePill) {
    issues.push('LIVE pill not found in HTML');
  } else {
    info.push('LIVE pill: present ✓');
  }

  const status = issues.length ? (cardMatches >= 3 ? 'warn' : 'fail') : 'pass';
  return {
    name:   'ui_smoke',
    status,
    detail: [...info, ...issues].join(' | '),
    raw:    { cardCount: cardMatches, hasLivePill },
  };
}

// ── orchestrator ──────────────────────────────────────────────────────────────

async function runHealthCheck() {
  const startMs = nowMs();

  const checks = await Promise.allSettled([
    checkSiteAvailability(),
    checkDataFreshness(),
    checkTimestampIntegrity(),
    checkSynthesisHealth(),
    checkBuildHealth(),
    checkUiSmoke(),
  ]);

  const results = checks.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['site_availability','data_freshness','timestamp_integrity','synthesis_health','build_health','ui_smoke'];
    return { name: names[i], status: 'fail', detail: `Check threw: ${r.reason?.message || r.reason}` };
  });

  // Roll up overall status
  const hasFail    = results.some(c => c.status === 'fail');
  const hasWarn    = results.some(c => c.status === 'warn');
  const overall    = hasFail ? 'critical' : hasWarn ? 'degraded' : 'healthy';

  const failList   = results.filter(c => c.status === 'fail').map(c => c.name);
  const warnList   = results.filter(c => c.status === 'warn').map(c => c.name);

  let summary;
  if (overall === 'healthy') {
    summary = 'All systems nominal. Site is reachable, data is fresh, synthesis is current, and the UI renders correctly.';
  } else if (overall === 'degraded') {
    summary = `System is degraded. ${warnList.length} check(s) raised warnings: ${warnList.join(', ')}. No critical failures detected.`;
  } else {
    summary = `System is in a CRITICAL state. ${failList.length} check(s) failed: ${failList.join(', ')}.${warnList.length ? ` Additionally ${warnList.length} warn(s): ${warnList.join(', ')}.` : ''} Immediate attention required.`;
  }

  const report = {
    timestamp: new Date().toISOString(),
    durationMs: nowMs() - startMs,
    status: overall,
    checks: results.map(({ raw, ...rest }) => rest),  // omit raw from top-level
    summary,
    _raw: results,  // keep raw for debugging
  };

  // Save report
  const now        = new Date();
  const y          = now.getUTCFullYear();
  const mo         = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d          = String(now.getUTCDate()).padStart(2, '0');
  const h          = String(now.getUTCHours()).padStart(2, '0');
  const reportDir  = path.join(ROOT, 'data', 'health');
  const reportFile = path.join(reportDir, `${y}-${mo}-${d}-${h}.json`);

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  // ── Human-readable stdout ────────────────────────────────────────────────
  const STATUS_ICON = { pass: '✅', warn: '⚠️ ', fail: '❌' };
  const OVERALL_ICON = { healthy: '💚', degraded: '🟡', critical: '🔴' };

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  MEP Dashboard Health Check — ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Overall: ${OVERALL_ICON[overall]} ${overall.toUpperCase()}  (completed in ${report.durationMs}ms)`);
  console.log('');

  for (const c of results) {
    const icon = STATUS_ICON[c.status] || '❓';
    console.log(`  ${icon} ${c.name.replace(/_/g, ' ').padEnd(24)} ${c.status.toUpperCase()}`);
    // Wrap detail at ~100 chars
    const detail = c.detail || '';
    const parts  = detail.split(' | ');
    for (const p of parts) {
      if (p.trim()) console.log(`       ${p.trim()}`);
    }
  }

  console.log('');
  console.log(`  📋 Summary: ${summary}`);
  console.log(`  📁 Report saved to: ${reportFile}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  return report;
}

// ── entry point ───────────────────────────────────────────────────────────────

runHealthCheck().then(report => {
  process.exit(report.status === 'critical' ? 2 : report.status === 'degraded' ? 1 : 0);
}).catch(err => {
  console.error('Health check crashed:', err);
  process.exit(3);
});

// ===== LAYER 1: DATA COLLECTION =====
// Fetches RSS feeds, deduplicates, persists to data/YYYY-MM-DD.json.
// Also synthesizes Key Developments via Gemini after collecting articles.
// Translates article titles/snippets to Hebrew (_he fields) in-place.

const { fetchAllFeeds } = require('./src/fetcher');
const { persistDailyArticles } = require('./src/persistence');
const { main: synthesizeDev } = require('./src/synthesize-developments');
const { main: fetchVideos } = require('./fetch-videos');
const { getGeminiKey } = require('./src/config');
const { initModel, translateArticles } = require('./src/translate-hebrew');

// ===== PROCESS-LEVEL WATCHDOG =====
// If the entire fetch+build cycle hasn't completed in 4 minutes, self-terminate.
// This prevents hung TCP connections to stalled feeds from blocking the LaunchAgent.
// The LA will restart the process on its next 3-minute interval automatically.
const PROCESS_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes
const watchdog = setTimeout(() => {
  console.error(`[DATA] ⏱️  WATCHDOG: Process exceeded ${PROCESS_TIMEOUT_MS / 1000}s — self-terminating to allow LaunchAgent restart.`);
  process.exit(2);
}, PROCESS_TIMEOUT_MS);
watchdog.unref(); // Don't let the timer itself prevent a clean exit if we finish normally

async function main() {
  console.log('[DATA] 🔶 Iran War Update — Data Collection');
  console.log(`[DATA]    Time: ${new Date().toISOString()}`);

  const { articles, sourceStats, purgeUrls } = await fetchAllFeeds();
  console.log(`[DATA] 📊 Fetched ${articles.length} articles from ${sourceStats.length} feeds`);

  // --- Translate article titles/snippets to Hebrew ---
  // Translation is non-critical: cap at 90s so it never blocks the build cycle.
  console.log('[DATA] 🔤 Translating articles to Hebrew...');
  try {
    const googleKey = getGeminiKey();
    if (googleKey) {
      const model = initModel(googleKey);
      const TRANSLATE_TIMEOUT_MS = 90000; // 90 seconds max
      await Promise.race([
        translateArticles(model, articles),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Translation timed out after 90s')), TRANSLATE_TIMEOUT_MS))
      ]);
      console.log('[DATA] ✅ Hebrew translation complete.');
    } else {
      console.warn('[DATA] ⚠️  No GOOGLE_API_KEY — skipping Hebrew translation.');
    }
  } catch (err) {
    console.error(`[DATA] ⚠️  Hebrew translation failed: ${err.message}. Continuing with English fallback.`);
    // Ensure all articles have _he fields even if translation failed/timed out
    articles.forEach(a => {
      if (!a.title_he) a.title_he = a.title;
      if (a.snippet_he === undefined) a.snippet_he = a.snippet || '';
    });
  }

  // Persist to daily JSON (deduplicates automatically; purges stale pre-scheduled entries)
  const merged = persistDailyArticles(articles, purgeUrls);
  console.log(`[DATA] 📁 Daily archive now has ${merged.length} total articles`);

  // Log source breakdown
  const succeeded = sourceStats.filter(s => !s.error).length;
  const failed = sourceStats.filter(s => s.error).length;
  console.log(`[DATA] ✅ Sources: ${succeeded} OK, ${failed} failed`);

  if (failed > 0) {
    const failedNames = sourceStats.filter(s => s.error).map(s => s.name).join(', ');
    console.log(`[DATA] ⚠️  Failed: ${failedNames}`);
  }

  // --- Synthesize Key Developments (Gemini) ---
  console.log('[DATA] 🔍 Synthesizing key developments...');
  try {
    const devs = await synthesizeDev(merged);
    if (devs) {
      console.log(`[DATA] 🔍 Key developments: ${devs.map(d => d.headline).join(' | ')}`);
    } else {
      console.warn('[DATA] ⚠️  Developments synthesis returned null (previous file retained if exists).');
    }
  } catch (err) {
    console.error(`[DATA] ⚠️  Developments synthesis failed: ${err.message}`);
  }

  // --- Fetch YouTube Videos ---
  console.log('[DATA] 🎬 Fetching YouTube video feeds...');
  try {
    const videos = await fetchVideos();
    console.log(`[DATA] 🎬 Videos: ${(videos || []).length} saved to data/videos.json`);
  } catch (err) {
    console.error(`[DATA] ⚠️  Video fetch failed: ${err.message}`);
  }

  console.log('[DATA] ✅ Data collection complete.');

  // Auto-rebuild site
  const { execSync } = require('child_process');
  console.log('[DATA] 🔨 Rebuilding site...');
  execSync('node build.js', { cwd: __dirname, stdio: 'inherit' });
  console.log('[DATA] ✅ Site rebuilt and live.');
}

main()
  .then(() => clearTimeout(watchdog))
  .catch(err => {
    console.error('[DATA] ❌ Fatal error:', err);
    process.exit(1);
  });

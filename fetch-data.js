// ===== LAYER 1: DATA COLLECTION =====
// Fetches RSS feeds, deduplicates, persists to data/YYYY-MM-DD.json.
// Also synthesizes Key Developments via Gemini after collecting articles.
// Translates article titles/snippets to Hebrew (_he fields) in-place.

const { fetchAllFeeds } = require('./src/fetcher');
const { persistDailyArticles } = require('./src/persistence');
const { main: synthesizeDev } = require('./src/synthesize-developments');
const { main: fetchVideos } = require('./fetch-videos');
const { getGeminiKey } = require('./src/synthesizer');
const { initModel, translateArticles } = require('./src/translate-hebrew');

async function main() {
  console.log('[DATA] 🔶 Iran War Update — Data Collection');
  console.log(`[DATA]    Time: ${new Date().toISOString()}`);

  const { articles, sourceStats, purgeUrls } = await fetchAllFeeds();
  console.log(`[DATA] 📊 Fetched ${articles.length} articles from ${sourceStats.length} feeds`);

  // --- Translate article titles/snippets to Hebrew ---
  console.log('[DATA] 🔤 Translating articles to Hebrew...');
  try {
    const googleKey = getGeminiKey();
    if (googleKey) {
      const model = initModel(googleKey);
      await translateArticles(model, articles);
      console.log('[DATA] ✅ Hebrew translation complete.');
    } else {
      console.warn('[DATA] ⚠️  No GOOGLE_API_KEY — skipping Hebrew translation.');
    }
  } catch (err) {
    console.error(`[DATA] ⚠️  Hebrew translation failed: ${err.message}`);
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

main().catch(err => {
  console.error('[DATA] ❌ Fatal error:', err);
  process.exit(1);
});

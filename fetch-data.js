// ===== LAYER 1: DATA COLLECTION =====
// Fetches RSS feeds, deduplicates, persists to data/YYYY-MM-DD.json.
// Also synthesizes Key Developments via Gemini after collecting articles.

const { fetchAllFeeds } = require('./src/fetcher');
const { persistDailyArticles } = require('./src/persistence');
const { main: synthesizeDev } = require('./src/synthesize-developments');

async function main() {
  console.log('[DATA] 🔶 Iran War Update — Data Collection');
  console.log(`[DATA]    Time: ${new Date().toISOString()}`);

  const { articles, sourceStats, purgeUrls } = await fetchAllFeeds();
  console.log(`[DATA] 📊 Fetched ${articles.length} articles from ${sourceStats.length} feeds`);

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

  console.log('[DATA] ✅ Data collection complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('[DATA] ❌ Fatal error:', err);
  process.exit(1);
});

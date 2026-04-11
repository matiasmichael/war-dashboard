// ===== LAYER 1: DATA COLLECTION =====
// Fetches RSS feeds, deduplicates, persists to data/YYYY-MM-DD.json.
// NO Gemini calls, NO HTML generation. Fast, cheap, runs every 15 min.

const { fetchAllFeeds } = require('./src/fetcher');
const { persistDailyArticles } = require('./src/persistence');

async function main() {
  console.log('[DATA] 🔶 Iran War Update — Data Collection');
  console.log(`[DATA]    Time: ${new Date().toISOString()}`);

  const { articles, sourceStats } = await fetchAllFeeds();
  console.log(`[DATA] 📊 Fetched ${articles.length} articles from ${sourceStats.length} feeds`);

  // Persist to daily JSON (deduplicates automatically)
  const merged = persistDailyArticles(articles);
  console.log(`[DATA] 📁 Daily archive now has ${merged.length} total articles`);

  // Log source breakdown
  const succeeded = sourceStats.filter(s => !s.error).length;
  const failed = sourceStats.filter(s => s.error).length;
  console.log(`[DATA] ✅ Sources: ${succeeded} OK, ${failed} failed`);

  if (failed > 0) {
    const failedNames = sourceStats.filter(s => s.error).map(s => s.name).join(', ');
    console.log(`[DATA] ⚠️  Failed: ${failedNames}`);
  }

  console.log('[DATA] ✅ Data collection complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('[DATA] ❌ Fatal error:', err);
  process.exit(1);
});

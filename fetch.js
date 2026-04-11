// ===== ENTRY POINT =====
// Orchestrates: fetch feeds → persist → synthesize → save JSON for Astro.

const fs = require('fs');
const path = require('path');
const { fetchAllFeeds } = require('./src/fetcher');
const { synthesizeReport } = require('./src/synthesizer');
const { persistDailyArticles } = require('./src/persistence');
const { atomicWriteSync } = require('./src/utils');

async function main() {
  console.log('🔶 Iran War Update — Fetching latest news...');
  console.log(`   Time: ${new Date().toISOString()}`);

  const { articles, sourceStats } = await fetchAllFeeds();
  console.log(`\n📊 Total: ${articles.length} articles`);

  // Persist articles to daily JSON for archive feature
  persistDailyArticles(articles);

  const situationReportData = await synthesizeReport(articles);

  // Save processed data as JSON for Astro to consume at build time
  const dataOut = {
    articles,
    sourceStats,
    sitrep: situationReportData,
    generatedAt: new Date().toISOString()
  };

  const outPath = path.join(__dirname, 'src', 'data', 'latest.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  atomicWriteSync(outPath, JSON.stringify(dataOut, null, 2));

  console.log(`✅ Data saved: ${outPath}`);
  console.log(`   Size: ${(Buffer.byteLength(JSON.stringify(dataOut)) / 1024).toFixed(1)} KB`);
  console.log(`   Articles: ${articles.length}`);
  console.log(`   Sitrep: ${situationReportData ? 'yes' : 'no'}`);
  console.log('\n📦 Run "npm run build" to generate the static site.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

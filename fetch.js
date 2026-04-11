// ===== ENTRY POINT =====
// Orchestrates: fetch feeds → persist → synthesize → render HTML.

const fs = require('fs');
const path = require('path');
const { fetchAllFeeds } = require('./src/fetcher');
const { synthesizeReport } = require('./src/synthesizer');
const { persistDailyArticles } = require('./src/persistence');
const { generateHTML } = require('./src/renderer');
const { atomicWriteSync } = require('./src/utils');

async function main() {
  console.log('🔶 Iran War Update — Fetching latest news...');
  console.log(`   Time: ${new Date().toISOString()}`);

  const { articles, sourceStats } = await fetchAllFeeds();
  console.log(`\n📊 Total: ${articles.length} articles`);

  // Persist articles to daily JSON for archive feature
  persistDailyArticles(articles);

  const situationReportData = await synthesizeReport(articles);
  const html = generateHTML(articles, sourceStats, situationReportData);

  const outPath = path.join(__dirname, 'public', 'index.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // Atomic write for generated HTML (Item #9)
  atomicWriteSync(outPath, html);

  console.log(`✅ Generated: ${outPath}`);
  console.log(`   Size: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

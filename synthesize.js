// ===== LAYER 2: AI SYNTHESIS =====
// Reads accumulated articles from data/YYYY-MM-DD.json (full day),
// calls Gemini for sitrep with delta framing, saves sitrep, triggers build.
// Runs every 1 hour.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { synthesizeReport } = require('./src/synthesizer');
const { getIsraelDateStr } = require('./src/persistence');

const DATA_DIR = path.join(__dirname, 'data');

async function main() {
  console.log('[SYNTH] 🧠 Iran War Update — AI Synthesis');
  console.log(`[SYNTH]    Time: ${new Date().toISOString()}`);

  // Read ALL articles from today's accumulated data file
  const today = getIsraelDateStr(new Date());
  const dailyFile = path.join(DATA_DIR, `${today}.json`);

  if (!fs.existsSync(dailyFile)) {
    console.error(`[SYNTH] ❌ No data file for today (${today}). Run fetch-data.js first.`);
    process.exit(1);
  }

  let articles;
  try {
    articles = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
  } catch (e) {
    console.error(`[SYNTH] ❌ Failed to parse ${dailyFile}: ${e.message}`);
    process.exit(1);
  }

  console.log(`[SYNTH] 📰 Read ${articles.length} articles from ${dailyFile}`);

  if (articles.length === 0) {
    console.warn('[SYNTH] ⚠️  No articles found. Skipping synthesis.');
    process.exit(0);
  }

  // Call Gemini for sitrep (synthesizer handles delta framing, retries, error files)
  const situationReportData = await synthesizeReport(articles);

  if (situationReportData) {
    // Also save as sitrep-latest.json for the build layer
    const sitrepLatestPath = path.join(DATA_DIR, 'sitrep-latest.json');
    const sitrepOut = {
      ...situationReportData,
      generatedAt: new Date().toISOString(),
      articleCount: articles.length
    };
    fs.writeFileSync(sitrepLatestPath, JSON.stringify(sitrepOut, null, 2));
    console.log(`[SYNTH] 💾 Sitrep saved: ${sitrepLatestPath}`);
  } else {
    console.warn('[SYNTH] ⚠️  Gemini synthesis failed — build will proceed without sitrep.');
  }

  // Trigger the build
  console.log('[SYNTH] 📦 Triggering build...');
  try {
    execSync('node build.js', { stdio: 'inherit', cwd: __dirname });
  } catch (e) {
    console.error(`[SYNTH] ❌ Build failed: ${e.message}`);
    process.exit(1);
  }

  console.log('[SYNTH] ✅ Synthesis + build complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('[SYNTH] ❌ Fatal error:', err);
  process.exit(1);
});

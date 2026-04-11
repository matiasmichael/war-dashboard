// ===== LAYER 3: PRESENTATION =====
// Reads data/YYYY-MM-DD.json (articles) + data/sitrep-latest.json (sitrep),
// writes src/data/latest.json for Astro, then runs npm run build.
// Can be called independently (e.g., after a code change without re-fetching).

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getIsraelDateStr } = require('./src/persistence');
const { atomicWriteSync } = require('./src/utils');

const DATA_DIR = path.join(__dirname, 'data');

function main() {
  console.log('[BUILD] 📦 Iran War Update — Build');
  console.log(`[BUILD]    Time: ${new Date().toISOString()}`);

  // --- Read articles from today's data file ---
  const today = getIsraelDateStr(new Date());
  const dailyFile = path.join(DATA_DIR, `${today}.json`);

  let articles = [];
  if (fs.existsSync(dailyFile)) {
    try {
      articles = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
      console.log(`[BUILD] 📰 Loaded ${articles.length} articles from ${dailyFile}`);
    } catch (e) {
      console.warn(`[BUILD] ⚠️  Could not parse ${dailyFile}: ${e.message}`);
    }
  } else {
    console.warn(`[BUILD] ⚠️  No data file for today (${today}). Building with empty articles.`);
  }

  // --- Read sitrep ---
  const sitrepPath = path.join(DATA_DIR, 'sitrep-latest.json');
  let sitrep = null;
  if (fs.existsSync(sitrepPath)) {
    try {
      sitrep = JSON.parse(fs.readFileSync(sitrepPath, 'utf-8'));
      console.log(`[BUILD] 🧠 Loaded sitrep (generated at ${sitrep.generatedAt || 'unknown'})`);
    } catch (e) {
      console.warn(`[BUILD] ⚠️  Could not parse sitrep-latest.json: ${e.message}`);
    }
  } else {
    console.warn('[BUILD] ⚠️  No sitrep-latest.json found. Page will show "AI synthesis unavailable".');
  }

  // --- Read key developments ---
  const devsPath = path.join(DATA_DIR, 'developments.json');
  let developments = null;
  if (fs.existsSync(devsPath)) {
    try {
      const devsData = JSON.parse(fs.readFileSync(devsPath, 'utf-8'));
      developments = devsData.developments || null;
      console.log(`[BUILD] 🔍 Loaded ${(developments || []).length} key developments (generated at ${devsData.generatedAt || 'unknown'})`);
    } catch (e) {
      console.warn(`[BUILD] ⚠️  Could not parse developments.json: ${e.message}`);
    }
  } else {
    console.warn('[BUILD] ⚠️  No developments.json found. Homepage will skip Key Developments section.');
  }

  // --- Compute source stats from articles ---
  const sourceCounts = {};
  const sourceMetaMap = {};
  articles.forEach(a => {
    if (!sourceCounts[a.source]) {
      sourceCounts[a.source] = 0;
      sourceMetaMap[a.source] = { name: a.source, logo: a.logo };
    }
    sourceCounts[a.source]++;
  });
  const sourceStats = Object.entries(sourceCounts).map(([name, count]) => ({
    name,
    logo: sourceMetaMap[name]?.logo || '📰',
    count
  }));

  // --- Write src/data/latest.json ---
  const dataOut = {
    articles,
    sourceStats,
    sitrep,
    developments,
    generatedAt: new Date().toISOString()
  };

  const outPath = path.join(__dirname, 'src', 'data', 'latest.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  atomicWriteSync(outPath, JSON.stringify(dataOut, null, 2));

  console.log(`[BUILD] 💾 Data written: ${outPath}`);
  console.log(`[BUILD]    Articles: ${articles.length}`);
  console.log(`[BUILD]    Sitrep: ${sitrep ? 'yes' : 'no'}`);
  console.log(`[BUILD]    Size: ${(Buffer.byteLength(JSON.stringify(dataOut)) / 1024).toFixed(1)} KB`);

  // --- Run Astro build ---
  console.log('[BUILD] 🔨 Running astro build...');
  try {
    execSync('npx astro build', { stdio: 'inherit', cwd: __dirname });
    console.log('[BUILD] ✅ Astro build complete. Site output in dist/');
  } catch (e) {
    console.error(`[BUILD] ❌ Astro build failed: ${e.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main();

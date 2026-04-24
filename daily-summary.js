// ===== DAILY SUMMARY GENERATOR =====
// Generates a comprehensive daily intelligence briefing using Gemini.
// Imports shared config instead of hardcoding values (Item #11).

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_MODEL, TIMEZONE, getGeminiKey } = require('./src/config');
const { initModel: initTranslateModel, translateDailyBriefing } = require('./src/translate-hebrew');
const { atomicWriteSync } = require('./src/utils');

const DATA_DIR = path.join(__dirname, 'data');
const DAILY_DIR = path.join(DATA_DIR, 'daily');

async function generateDailySummary(dateStr) {
  console.log(`📋 Generating daily summary for ${dateStr}...`);

  // Read the day's articles
  const articlesFile = path.join(DATA_DIR, `${dateStr}.json`);
  if (!fs.existsSync(articlesFile)) {
    console.error(`❌ No articles file found for ${dateStr} at ${articlesFile}`);
    process.exit(1);
  }

  const articles = JSON.parse(fs.readFileSync(articlesFile, 'utf-8'));
  console.log(`   Found ${articles.length} articles for ${dateStr}`);

  if (articles.length === 0) {
    console.error(`❌ No articles for ${dateStr}, skipping summary.`);
    process.exit(1);
  }

  // Prepare article context — times in Israel timezone
  const articleContext = articles.map((a, i) => {
    const time = a.date ? new Date(a.date).toLocaleTimeString('en-US', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }) : 'unknown';
    return `[${i + 1}] [${a.source}] [${time} IDT] ${a.title}\n${a.snippet || ''}`;
  }).join('\n\n');

  // Compute source stats
  const sourceCounts = {};
  articles.forEach(a => {
    sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
  });
  const mostActiveSrc = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];

  const apiKey = getGeminiKey();
  if (!apiKey) {
    console.error('❌ No GOOGLE_API_KEY found in OpenClaw config.');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `You are a senior intelligence analyst producing the daily briefing for an Iran-Israel conflict monitoring platform called "Middle East Pulse." 

IMPORTANT: ALL times in your output must be normalized to Israel timezone (Asia/Jerusalem, currently IDT = UTC+3). When article timestamps are provided, they are already converted to IDT. All "time" fields in key_events must use Israel time with the format "HH:MM IDT" (24h or 12h). Do NOT use GMT or UTC.

Today's date: ${dateStr}
Total articles collected today: ${articles.length}
Sources reporting: ${Object.keys(sourceCounts).length}
Most active source: ${mostActiveSrc[0]} (${mostActiveSrc[1]} articles)

Here are ALL ${articles.length} articles collected today:

${articleContext}

Produce a comprehensive daily intelligence briefing as a JSON object. Return ONLY valid JSON (no markdown fences, no commentary) with this exact structure:

{
  "date": "${dateStr}",
  "headline": "Single sentence headline of the day — the most important development (max 15 words)",
  "summary": "3-4 paragraphs providing a comprehensive overview of the day's developments in the Iran-Israel conflict. Cover military operations, diplomatic moves, humanitarian impacts, and proxy conflicts. Use <p> tags to separate paragraphs. Be analytical and objective.",
  "key_events": [
    {
      "time": "HH:MM IDT or 'Morning'/'Afternoon'/'Evening' if exact time unknown (always Israel time)",
      "headline": "Short punchy headline (max 12 words)",
      "source": "Primary source name",
      "category": "One of: diplomacy, military, intelligence, proxy",
      "description": "2-3 sentence description of the event and its significance"
    }
  ],
  "statistics": {
    "total_articles": ${articles.length},
    "sources_reporting": ${Object.keys(sourceCounts).length},
    "most_active_source": "${mostActiveSrc[0]}",
    "escalation_level": 3
  },
  "what_changed": [
    "One-line summary of the most important strategic change today",
    "One-line summary of the second most important change",
    "One-line summary of the third most important change"
  ],
  "outlook": "1-2 sentences on what to watch tomorrow or in the coming days."
}

RULES:
- key_events should have 5-8 items, ordered chronologically
- Each key_event MUST include a "category" field with exactly one of: "diplomacy", "military", "intelligence", "proxy"
- escalation_level is 1-5 scale: 1=calm, 2=tensions, 3=active conflict, 4=major escalation, 5=full-scale war
- what_changed must be exactly 3 items — each a single concise sentence summarizing a key strategic shift, military development, or diplomatic move from the day
- Be analytical, not sensational
- Focus on Iran-Israel conflict dynamics including proxies (Hezbollah, Hamas, Houthis)
- The summary should read like a professional intelligence briefing
- ONLY use HTML tags like <strong> for emphasis. NEVER use markdown syntax like **bold** or *italic*.
- Output ONLY the JSON object`;

  console.log('   Calling Gemini for daily briefing...');
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();

  // Clean markdown wrappers
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();

  // Convert any residual markdown bold to HTML (Gemini sometimes ignores prompt instructions)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  let briefing;
  try {
    briefing = JSON.parse(text);
  } catch (e) {
    console.error('❌ Failed to parse Gemini response as JSON:', e.message);
    console.error('Raw response:', text.slice(0, 500));
    process.exit(1);
  }

  // Ensure stats are correct (override AI hallucination)
  briefing.statistics = briefing.statistics || {};
  briefing.statistics.total_articles = articles.length;
  briefing.statistics.sources_reporting = Object.keys(sourceCounts).length;
  briefing.statistics.most_active_source = mostActiveSrc[0];

  // Translate to Hebrew
  try {
    const translateModel = initTranslateModel(apiKey);
    await translateDailyBriefing(translateModel, briefing);
  } catch (err) {
    console.error('⚠️ Hebrew translation failed:', err.message);
  }

  // Save the briefing with atomic write
  fs.mkdirSync(DAILY_DIR, { recursive: true });
  const outPath = path.join(DAILY_DIR, `${dateStr}.json`);
  atomicWriteSync(outPath, JSON.stringify(briefing, null, 2));

  console.log(`✅ Daily briefing saved: ${outPath}`);
  console.log(`   Headline: ${briefing.headline}`);
  console.log(`   Key events: ${briefing.key_events?.length || 0}`);
  console.log(`   Escalation level: ${briefing.statistics.escalation_level}/5`);

  return briefing;
}

// ===== MAIN =====
async function main() {
  const dateArg = process.argv[2];
  const dateStr = dateArg || new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });

  await generateDailySummary(dateStr);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// ===== CONFIG =====
const DATA_DIR = path.join(__dirname, 'data');
const DAILY_DIR = path.join(DATA_DIR, 'daily');

function getGeminiKey() {
  const configPath = path.join(process.env.HOME, '.openclaw/openclaw.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config.env.GOOGLE_API_KEY;
}

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

  // Prepare article context for Gemini
  const articleContext = articles.map((a, i) => {
    const time = a.date ? new Date(a.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'unknown';
    return `[${i + 1}] [${a.source}] [${time}] ${a.title}\n${a.snippet || ''}`;
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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are a senior intelligence analyst producing the daily briefing for an Iran-Israel conflict monitoring platform called "Iran War Update." 

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
      "time": "HH:MM or 'Morning'/'Afternoon'/'Evening' if exact time unknown",
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
- Output ONLY the JSON object`;

  console.log('   Calling Gemini for daily briefing...');
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();

  // Clean markdown wrappers
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();

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

  // Save the briefing
  fs.mkdirSync(DAILY_DIR, { recursive: true });
  const outPath = path.join(DAILY_DIR, `${dateStr}.json`);
  fs.writeFileSync(outPath, JSON.stringify(briefing, null, 2), 'utf-8');

  console.log(`✅ Daily briefing saved: ${outPath}`);
  console.log(`   Headline: ${briefing.headline}`);
  console.log(`   Key events: ${briefing.key_events?.length || 0}`);
  console.log(`   Escalation level: ${briefing.statistics.escalation_level}/5`);

  return briefing;
}

// ===== MAIN =====
async function main() {
  // Accept a date argument, or default to today
  const dateArg = process.argv[2];
  const dateStr = dateArg || new Date().toISOString().split('T')[0];

  await generateDailySummary(dateStr);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

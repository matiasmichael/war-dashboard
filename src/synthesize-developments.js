// ===== KEY DEVELOPMENTS SYNTHESIS =====
// Reads today's articles, calls Gemini to identify the 4 most significant
// developments, saves to data/developments.json.
// Designed to run as part of the fetch pipeline (every cycle).

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  GEMINI_MODEL,
  MAX_ARTICLES_FOR_SYNTHESIS,
  GEMINI_RETRY_ATTEMPTS,
  GEMINI_RETRY_DELAY_MS,
  getGeminiKey
} = require('./config');
const { atomicWriteSync, sleep } = require('./utils');
const { initModel: initTranslateModel, translateDevelopments } = require('./translate-hebrew');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Format a date as relative time (e.g. "2h ago", "45m ago", "5d ago").
 */
function relativeTime(dateStr, now) {
  if (!dateStr) return 'unknown';
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return 'unknown';
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// getGeminiKey() is now imported from ./config.js

/**
 * Call Gemini API with retry logic.
 */
async function callGeminiWithRetry(model, prompt) {
  let lastError;
  for (let attempt = 1; attempt <= GEMINI_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      lastError = err;
      console.warn(`[DEV_SYNTH] Attempt ${attempt}/${GEMINI_RETRY_ATTEMPTS} failed: ${err.message}`);
      if (attempt < GEMINI_RETRY_ATTEMPTS) {
        console.log(`  Retrying in ${GEMINI_RETRY_DELAY_MS / 1000}s...`);
        await sleep(GEMINI_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

/**
 * Synthesize 4 key developments from today's articles.
 * Returns the developments array, or null on failure.
 */
async function synthesizeDevelopments(articles) {
  try {
    console.log('[DEV_SYNTH] 🔍 Synthesizing Key Developments...');

    const googleKey = getGeminiKey();
    if (!googleKey) {
      console.warn('[DEV_SYNTH] No GOOGLE_API_KEY found. Skipping.');
      return null;
    }

    const genAI = new GoogleGenerativeAI(googleKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const now = new Date();
    const recentArticles = articles.slice(0, MAX_ARTICLES_FOR_SYNTHESIS);
    const feedContext = recentArticles.map(a => {
      const rel = relativeTime(a.date, now);
      return `[${a.source}] (${rel}) ${a.title}\n${a.snippet || ''}`;
    }).join('\n\n');

    // Compute the time window of our articles
    const newest = recentArticles[0]?.date ? new Date(recentArticles[0].date) : now;
    const oldest = recentArticles[recentArticles.length - 1]?.date ? new Date(recentArticles[recentArticles.length - 1].date) : now;
    const windowDesc = `Articles span from ${relativeTime(oldest.toISOString(), now)} to ${relativeTime(newest.toISOString(), now)}.`;

    const prompt = `You are an intelligence analyst writing a CURRENT SITUATION snapshot — a "NOW" picture, not a daily recap.

Current time: ${now.toISOString()}
${windowDesc}

Each article below has a relative timestamp (e.g. "2h ago"). Use these to understand temporal flow.

## ARTICLES
${feedContext}

## TASK
Identify the **4 most significant and distinct developments** in the Iran-Israel conflict theater RIGHT NOW.

## TEMPORAL RULES (CRITICAL)
- **Prioritize the last 3 hours.** These are your headline developments.
- Articles older than 3 hours are BACKGROUND CONTEXT only — use them to enrich understanding, not as headline material unless they describe an ongoing situation.
- If a ceasefire, truce, or talks are underway, do NOT present pre-ceasefire strikes as current developments. Frame them as context ("prior to ceasefire").
- Each development MUST reflect its temporal state: Is it happening NOW? Did it just happen? Is it a developing situation from earlier?
- Think: "What would a commander need to know RIGHT NOW?" — not "What happened today?"

Return ONLY valid JSON (no markdown fences, no commentary) with this exact structure:
{
  "developments": [
    {
      "headline": "Short punchy headline, 5-8 words",
      "summary": "1-2 sentences explaining what is happening and why it matters. Write like an intelligence analyst. Cold, factual, zero filler. Use present tense for ongoing events.",
      "sources": ["Source1", "Source2"],
      "severity": "critical|major|notable|developing",
      "category": "military|diplomacy|humanitarian|economic",
      "timeContext": "Ongoing|Just now|30m ago|2h ago|Earlier today"
    }
  ]
}

RULES:
- Exactly 4 developments. No more, no less.
- "headline": 5-8 words, punchy, present tense for ongoing events.
- "summary": Max 2 sentences, max 40 words. State the fact and its strategic implication.
- "sources": Array of source names that reported this. Use short names.
- "severity": One of: "critical" (imminent threat/major escalation), "major" (significant strategic shift), "notable" (important but not urgent), "developing" (emerging situation, watch closely).
- "category": One of: "military", "diplomacy", "humanitarian", "economic".
- "timeContext": When this development occurred or its current state. Use: "Ongoing" (still active), "Just now" (<15 min), "Xm ago" or "Xh ago" (specific), "Earlier today" (>6h ago).
- Each development must be genuinely distinct from the others.
- Scope: Iran-Israel direct, proxies (Hezbollah, Hamas, Houthis, IRGC), nuclear, regional escalation.
- Output ONLY the JSON object.`;

    let textOutput = await callGeminiWithRetry(model, prompt);

    // Clean up markdown wrappers
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();

    // Fix common Gemini JSON issues
    // Remove trailing commas before } or ]
    textOutput = textOutput.replace(/,\s*([}\]])/g, '$1');
    // Remove control characters that break JSON
    textOutput = textOutput.replace(/[\x00-\x1f\x7f]/g, (ch) => ch === '\n' || ch === '\t' ? ch : '');

    let parsed;
    try {
      parsed = JSON.parse(textOutput);
    } catch (parseErr) {
      // Try to extract JSON object from the response
      const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
        parsed = JSON.parse(cleaned);
      } else {
        throw parseErr;
      }
    }

    if (!parsed.developments || !Array.isArray(parsed.developments)) {
      throw new Error('Invalid response structure: missing developments array');
    }

    // Validate and normalize
    const developments = parsed.developments.slice(0, 4).map(d => ({
      headline: (d.headline || '').slice(0, 100),
      summary: (d.summary || '').slice(0, 300),
      sources: Array.isArray(d.sources) ? d.sources.slice(0, 6) : [],
      severity: ['critical', 'major', 'notable', 'developing'].includes(d.severity) ? d.severity : 'notable',
      category: ['military', 'diplomacy', 'humanitarian', 'economic'].includes(d.category) ? d.category : 'military',
      timeContext: (d.timeContext || 'Ongoing').slice(0, 30),
      updatedAt: new Date().toISOString()
    }));

    console.log(`[DEV_SYNTH] ✅ Identified ${developments.length} key developments`);

    // --- Translate developments to Hebrew (inline) ---
    try {
      const translateModel = initTranslateModel(googleKey);
      await translateDevelopments(translateModel, developments);
    } catch (err) {
      console.warn(`[DEV_SYNTH] ⚠️ Hebrew translation failed: ${err.message}`);
      // Fallback: set _he fields to English
      developments.forEach(d => {
        if (!d.headline_he) d.headline_he = d.headline;
        if (!d.summary_he) d.summary_he = d.summary;
      });
    }

    return developments;
  } catch (err) {
    console.error(`[DEV_SYNTH] ❌ Failed: ${err.message}`);
    return null;
  }
}

/**
 * Main entry point: read articles, synthesize, save.
 */
async function main(articles) {
  // If called directly (node src/synthesize-developments.js), read articles from disk
  if (!articles) {
    const { getIsraelDateStr } = require('./persistence');
    const today = getIsraelDateStr(new Date());
    const dailyFile = path.join(DATA_DIR, `${today}.json`);

    if (!fs.existsSync(dailyFile)) {
      console.error(`[DEV_SYNTH] ❌ No data file for today (${today}).`);
      return null;
    }

    articles = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
  }

  if (!articles || articles.length === 0) {
    console.warn('[DEV_SYNTH] ⚠️ No articles. Skipping developments synthesis.');
    return null;
  }

  const developments = await synthesizeDevelopments(articles);

  if (developments) {
    const outPath = path.join(DATA_DIR, 'developments.json');
    const outData = {
      developments,
      generatedAt: new Date().toISOString(),
      articleCount: articles.length
    };
    atomicWriteSync(outPath, JSON.stringify(outData, null, 2));
    console.log(`[DEV_SYNTH] 💾 Saved: ${outPath}`);
    return developments;
  }

  return null;
}

// Allow direct execution
if (require.main === module) {
  main().then(devs => {
    if (devs) {
      devs.forEach((d, i) => console.log(`  ${i + 1}. [${d.severity}] ${d.headline}`));
    }
    process.exit(devs ? 0 : 1);
  }).catch(err => {
    console.error('[DEV_SYNTH] ❌ Fatal:', err);
    process.exit(1);
  });
}

module.exports = { synthesizeDevelopments, main: main };

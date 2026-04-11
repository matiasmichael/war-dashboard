// ===== GEMINI INTEGRATION =====
// Synthesize situation report with retry logic and error surfacing (Items #3, #4).

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  GEMINI_MODEL,
  MAX_ARTICLES_FOR_SYNTHESIS,
  GEMINI_RETRY_ATTEMPTS,
  GEMINI_RETRY_DELAY_MS
} = require('./config');
const { atomicWriteSync, sleep } = require('./utils');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Load previous sitrep for delta framing.
 */
function loadPreviousSitrep() {
  const sitrepPath = path.join(DATA_DIR, 'last-sitrep.json');
  try {
    if (fs.existsSync(sitrepPath)) {
      const data = JSON.parse(fs.readFileSync(sitrepPath, 'utf-8'));
      console.log('📋 Loaded previous sitrep for delta framing');
      return data;
    }
  } catch (e) {
    console.warn('Could not load previous sitrep:', e.message);
  }
  return null;
}

/**
 * Save sitrep to disk using atomic write.
 */
function saveSitrep(sitrep) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sitrepPath = path.join(DATA_DIR, 'last-sitrep.json');
  atomicWriteSync(sitrepPath, JSON.stringify({ ...sitrep, generatedAt: new Date().toISOString() }, null, 2));
  console.log('💾 Saved current sitrep for next delta comparison');
}

/**
 * Write error details to data/last-error.json for monitoring (Item #3).
 */
function writeGeminiError(error) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const errorPath = path.join(DATA_DIR, 'last-error.json');
  const errorData = {
    timestamp: new Date().toISOString(),
    error: error.message || String(error),
    type: 'gemini'
  };
  try {
    atomicWriteSync(errorPath, JSON.stringify(errorData, null, 2));
  } catch (e) {
    console.error('[GEMINI_ERROR] Could not write error file:', e.message);
  }
}

/**
 * Call Gemini API with retry logic (Item #4).
 * 2 attempts with 5-second delay between them.
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
      console.warn(`[GEMINI_ERROR] Attempt ${attempt}/${GEMINI_RETRY_ATTEMPTS} failed: ${err.message}`);
      if (attempt < GEMINI_RETRY_ATTEMPTS) {
        console.log(`  Retrying in ${GEMINI_RETRY_DELAY_MS / 1000}s...`);
        await sleep(GEMINI_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

/**
 * Read the Gemini API key from OpenClaw config.
 */
function getGeminiKey() {
  const configPath = path.join(process.env.HOME, '.openclaw/openclaw.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config.env.GOOGLE_API_KEY;
}

/**
 * Synthesize a situation report from articles.
 * Returns parsed JSON briefing, or null on failure.
 */
async function synthesizeReport(articles) {
  try {
    console.log("Synthesizing Situation Report with Gemini...");

    const googleKey = getGeminiKey();
    if (!googleKey) {
      console.warn("[GEMINI_ERROR] No GOOGLE_API_KEY found. Skipping synthesis.");
      return null;
    }

    const genAI = new GoogleGenerativeAI(googleKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const recentArticles = articles.slice(0, MAX_ARTICLES_FOR_SYNTHESIS);
    const feedContext = recentArticles.map(a =>
      `[${a.source}] ${a.title}\n${a.snippet || ''}\nPublished: ${a.date || 'unknown'}`
    ).join("\n\n");

    // Delta framing
    const previousSitrep = loadPreviousSitrep();
    const deltaContext = previousSitrep ? `

PREVIOUS BRIEFING (generated at ${previousSitrep.generatedAt || 'unknown'}):
Summary: ${previousSitrep.summary || 'N/A'}
Top Updates: ${(previousSitrep.top_updates || []).map(u => u.headline).join('; ')}
Analysis: ${previousSitrep.detailed_analysis || 'N/A'}

IMPORTANT: Frame your summary and analysis as "what changed since the last update". Highlight new developments, shifts, and escalations compared to the previous briefing. Use phrases like "Since the last update...", "New development:", "Escalation:", etc.` : '';

    const prompt = `You are a senior intelligence briefer specializing in the Iran-Israel conflict. Analyze the following 25 latest headlines and produce a structured JSON briefing focused on the Iran-Israel war, including Iranian proxies (Hezbollah, Hamas, Houthis), direct Iran-Israel military exchanges, nuclear developments, and regional escalation.

Headlines:
${feedContext}${deltaContext}

Return ONLY valid JSON (no markdown fences, no commentary) with this exact structure:
{
  "summary": "2 sentences MAXIMUM. Hard limit: 40 words. Use <strong> tags to bold the 2-3 most important terms only. Plain text otherwise. No HTML except <strong>. Be ruthless — cut every unnecessary word. Focus on Iran-Israel conflict dynamics.",
  "top_updates": [
    { "headline": "Short punchy headline (max 12 words)", "source": "Source Name", "time": "e.g. 2h ago" },
    { "headline": "...", "source": "...", "time": "..." },
    { "headline": "...", "source": "...", "time": "..." }
  ],
  "detailed_analysis": "A longer 3-5 sentence analysis covering Iran-Israel tensions, proxy conflicts, nuclear dimensions, open questions, and what to watch. Use <strong> for key terms. This will be hidden by default behind a toggle."
}

RULES:
- summary must be 2 sentences, MAX 40 words total. Count them. If over 40, cut words until under.
- top_updates: pick the 3 MOST important/impactful stories related to the Iran-Israel conflict. Headline must be punchy and short.
- For "time" field, use relative time (e.g. "1h ago", "3h ago", "just now") based on the published dates.
- detailed_analysis: cover Iran-Israel tensions, proxy warfare, nuclear dimensions, and what to watch next. Max 80 words.
- Prioritize stories about Iran, Israel, Hezbollah, Hamas, Houthis, IRGC, nuclear program, and direct confrontation.
- Tone: objective, analytical, no sensationalism.
- ONLY use HTML tags like <strong> for emphasis. NEVER use markdown syntax like **bold** or *italic*.
- Output ONLY the JSON object, nothing else.`;

    let textOutput = await callGeminiWithRetry(model, prompt);

    // Clean up markdown wrappers
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();

    // Convert any residual markdown bold to HTML (Gemini sometimes ignores prompt instructions)
    textOutput = textOutput.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    const parsed = JSON.parse(textOutput);

    // Save sitrep for next delta comparison
    saveSitrep(parsed);

    return parsed;
  } catch (err) {
    // Item #3: distinctive prefix + error file
    console.error(`[GEMINI_ERROR] Failed to generate Situation Report: ${err.message}`);
    writeGeminiError(err);
    return null;
  }
}

module.exports = {
  synthesizeReport,
  loadPreviousSitrep,
  saveSitrep,
  getGeminiKey
};

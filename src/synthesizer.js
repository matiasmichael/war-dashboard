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

    // Delta context for detailed_analysis only (NOT for summary)
    const previousSitrep = loadPreviousSitrep();
    const deltaContext = previousSitrep ? `

PREVIOUS BRIEFING (generated at ${previousSitrep.generatedAt || 'unknown'}):
Top Updates: ${(previousSitrep.top_updates || []).map(u => u.headline).join('; ')}
Analysis: ${previousSitrep.detailed_analysis || 'N/A'}

USE THE PREVIOUS BRIEFING ONLY for the "detailed_analysis" field — to note shifts or new developments since last cycle. Do NOT reference it in the "summary" field at all.` : '';

    const prompt = `You are an intelligence analyst producing an executive sitrep on the Iran-Israel conflict theater. Write like a military intelligence briefing: cold, factual, zero filler. Every word must earn its place.

Scope: Iran-Israel direct confrontation, Iranian proxies (Hezbollah, Hamas, Houthis, IRGC), nuclear developments, regional escalation dynamics.

Headlines:
${feedContext}${deltaContext}

Return ONLY valid JSON (no markdown fences, no commentary) with this exact structure:
{
  "summary": "(see SUMMARY rules below)",
  "top_updates": [
    { "headline": "Short punchy headline (max 12 words)", "source": "Source Name", "time": "e.g. 2h ago" },
    { "headline": "...", "source": "...", "time": "..." },
    { "headline": "...", "source": "...", "time": "..." }
  ],
  "detailed_analysis": "(see ANALYSIS rules below)"
}

SUMMARY RULES:
- State the single most critical strategic/tactical reality of the conflict RIGHT NOW. Absolute snapshot — not a delta, not a narrative.
- 2 sentences MAX. Hard limit: 40 words. Count them. If over 40, cut until under.
- Use <strong> to bold the 2-3 most critical terms. No other HTML. No markdown.
- FORBIDDEN phrases (never use these or anything similar): "Since the last update", "In recent news", "In recent days", "Today", "According to reports", "Sources say", "It has been reported", "Developments include", "The situation continues". Do not use temporal hedging or attribution filler. State facts directly.
- Write like a flash message to a head of state. No preamble, no meta-commentary, no throat-clearing.

TOP UPDATES RULES:
- Pick the 3 MOST operationally significant stories. Headline must be punchy, max 12 words.
- "time" field: relative time (e.g. "1h ago", "3h ago", "just now") from published dates.

ANALYSIS RULES:
- 3-5 sentences, max 80 words. Cover: current force posture, proxy activity, nuclear dimension, and one key watch item.
- If previous briefing data is provided, you may note what shifted since last cycle. Otherwise write standalone.
- Use <strong> for key terms. No markdown.
- Same tone rules as summary: no meta-commentary, no attribution filler, no conversational language.

GLOBAL RULES:
- Prioritize: Iran, Israel, Hezbollah, Hamas, Houthis, IRGC, nuclear program, direct confrontation.
- Tone: clinical, declarative, zero sensationalism. Every sentence states a fact or an assessed implication.
- ONLY <strong> for emphasis. NEVER markdown bold/italic.
- Output ONLY the JSON object.`;

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

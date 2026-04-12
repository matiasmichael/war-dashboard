// ===== HEBREW TRANSLATION MODULE =====
// Batch-translates article titles, snippets, sitrep, and developments to Hebrew using Gemini.
// Called inline during the data-fetch pipeline — results are stored as _he fields
// in the same JSON objects, so every data file carries both English and Hebrew.

const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  GEMINI_MODEL,
  GEMINI_RETRY_ATTEMPTS,
  GEMINI_RETRY_DELAY_MS
} = require('./config');
const { sleep } = require('./utils');

/**
 * Detect if text contains Hebrew characters.
 */
function isHebrew(text) {
  if (!text) return false;
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Try to repair broken JSON from Gemini — handles unescaped quotes in Hebrew text.
 */
function repairJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    // Strategy: try to find and fix unescaped quotes inside string values.
    // Hebrew text often has " chars that Gemini doesn't escape.
    // We look for the pattern: "key": "value with " inside"
    // and replace inner quotes with escaped versions.
    let fixed = text;
    // Replace Hebrew quotation marks that aren't JSON structural
    fixed = fixed.replace(/(?<=[\u0590-\u05FF])"(?=[\u0590-\u05FF])/g, '\\"');
    fixed = fixed.replace(/(?<=[\u0590-\u05FF])"(?=\s*[\u0590-\u05FF])/g, '\\"');
    try {
      return JSON.parse(fixed);
    } catch (_) {
      // Last resort: strip all non-structural quotes from inside values
      // Find array or object
      const arrMatch = fixed.match(/\[[\s\S]*\]/);
      const objMatch = fixed.match(/\{[\s\S]*\}/);
      const jsonStr = arrMatch ? arrMatch[0] : (objMatch ? objMatch[0] : fixed);
      try {
        return JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'));
      } catch (e) {
        throw e;
      }
    }
  }
}

/**
 * Call Gemini with retry logic (mirrors synthesizer pattern).
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
      console.warn(`[TRANSLATE] Attempt ${attempt}/${GEMINI_RETRY_ATTEMPTS} failed: ${err.message}`);
      if (attempt < GEMINI_RETRY_ATTEMPTS) {
        console.log(`  Retrying in ${GEMINI_RETRY_DELAY_MS / 1000}s...`);
        await sleep(GEMINI_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

/**
 * Initialize Gemini model for translation.
 * @param {string} apiKey - Google API key
 * @returns {object} Gemini model instance
 */
function initModel(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

/**
 * Translate a batch of articles' titles and snippets to Hebrew.
 * Mutates articles in-place, adding title_he and snippet_he fields.
 * Skips articles that are already in Hebrew.
 *
 * @param {object} model - Gemini model instance
 * @param {Array} articles - Array of article objects
 */
async function translateArticles(model, articles) {
  // Identify English-only articles that need translation
  const toTranslate = [];
  const toTranslateIndices = [];

  articles.forEach((a, i) => {
    if (isHebrew(a.title)) {
      // Already Hebrew — title_he = title, snippet_he = snippet
      a.title_he = a.title;
      a.snippet_he = a.snippet || '';
    } else {
      toTranslate.push(a);
      toTranslateIndices.push(i);
    }
  });

  console.log(`[TRANSLATE] 📰 ${articles.length} articles: ${toTranslate.length} need translation, ${articles.length - toTranslate.length} already Hebrew`);

  if (toTranslate.length === 0) return;

  // Batch translate in groups of 15
  const BATCH_SIZE = 15;
  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE);
    const batchIndices = toTranslateIndices.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toTranslate.length / BATCH_SIZE);

    console.log(`[TRANSLATE]   Batch ${batchNum}/${totalBatches} (${batch.length} articles)...`);

    try {
      const items = batch.map((a, j) => {
        const parts = [`[${j}] Title: ${a.title}`];
        if (a.snippet) parts.push(`Snippet: ${a.snippet}`);
        return parts.join('\n');
      }).join('\n\n');

      const prompt = `You are a professional Hebrew translator for a news dashboard about the Iran-Israel conflict.

Translate the following news article titles and snippets from English to Hebrew.
- Use formal Hebrew news style (כתבה חדשותית)
- Keep proper nouns (names, places) in their standard Hebrew forms
- Keep the translations concise and punchy like headlines
- Maintain the same tone and meaning
- CRITICAL: In your JSON output, escape any double-quote characters inside string values with a backslash. For Hebrew quotation marks, use the Unicode characters \u05F4 (gershayim) or single quotes instead of double quotes.

Articles to translate:
${items}

Return ONLY valid JSON (no markdown fences, no commentary) as an array:
[
  { "index": 0, "title": "Hebrew title", "snippet": "Hebrew snippet or empty string if original was empty" },
  ...
]

Important: Return ALL ${batch.length} items. The "index" must match the original index. Ensure valid JSON — escape all double quotes inside strings.`;

      let text = await callGeminiWithRetry(model, prompt);
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      // Fix common JSON issues from Gemini
      text = text.replace(/,\s*([}\]])/g, '$1'); // trailing commas
      text = text.replace(/[\x00-\x1f\x7f]/g, (ch) => ch === '\n' || ch === '\t' ? ch : ''); // control chars
      
      let translations;
      try {
        translations = repairJson(text);
      } catch (parseErr) {
        // Try to extract array from response  
        const arrMatch = text.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          const cleaned = arrMatch[0].replace(/,\s*([}\]])/g, '$1');
          translations = repairJson(cleaned);
        } else {
          throw parseErr;
        }
      }

      for (const tr of translations) {
        const origIdx = batchIndices[tr.index];
        if (origIdx !== undefined && articles[origIdx]) {
          articles[origIdx].title_he = tr.title || articles[origIdx].title;
          articles[origIdx].snippet_he = tr.snippet || '';
        }
      }
    } catch (err) {
      console.error(`[TRANSLATE]   ⚠️ Batch ${batchNum} failed: ${err.message}. Using English as fallback.`);
      // Fallback: use English title/snippet for failed batch
      for (const idx of batchIndices) {
        if (articles[idx] && !articles[idx].title_he) {
          articles[idx].title_he = articles[idx].title;
          articles[idx].snippet_he = articles[idx].snippet || '';
        }
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < toTranslate.length) {
      await sleep(1000);
    }
  }

  // Final fallback: ensure every article has _he fields
  articles.forEach(a => {
    if (!a.title_he) a.title_he = a.title;
    if (a.snippet_he === undefined) a.snippet_he = a.snippet || '';
  });
}

/**
 * Translate sitrep fields to Hebrew. Mutates sitrep in-place,
 * adding summary_he, detailed_analysis_he, and headline_he on top_updates.
 *
 * @param {object} model - Gemini model instance
 * @param {object} sitrep - Sitrep object with summary, top_updates, detailed_analysis
 */
async function translateSitrep(model, sitrep) {
  if (!sitrep) return;

  console.log('[TRANSLATE] 🧠 Translating sitrep...');

  try {
    const prompt = `You are a professional Hebrew translator for a military intelligence dashboard.

Translate this situation report from English to Hebrew.
- Use formal military/intelligence Hebrew style
- Keep <strong> HTML tags intact — do NOT remove or translate them
- Keep the same structure and brevity
- Translate all text content but preserve HTML tags as-is

Content to translate:
Summary: ${sitrep.summary}
Top Updates:
${(sitrep.top_updates || []).map((u, i) => `  ${i + 1}. Headline: ${u.headline}`).join('\n')}
Detailed Analysis: ${sitrep.detailed_analysis || ''}

Return ONLY valid JSON (no markdown fences):
{
  "summary_he": "Hebrew summary with <strong> tags preserved",
  "top_updates_he": [
    { "headline_he": "Hebrew headline" },
    ...
  ],
  "detailed_analysis_he": "Hebrew analysis with <strong> tags preserved"
}

Important: Keep the same number of top_updates items (${(sitrep.top_updates || []).length}). Only translate text, not HTML tags.`;

    let text = await callGeminiWithRetry(model, prompt);
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    // Convert residual markdown bold to HTML
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const translated = repairJson(text);

    sitrep.summary_he = translated.summary_he || sitrep.summary;
    sitrep.detailed_analysis_he = translated.detailed_analysis_he || sitrep.detailed_analysis;

    if (translated.top_updates_he && sitrep.top_updates) {
      sitrep.top_updates.forEach((u, i) => {
        const heUpdate = translated.top_updates_he[i];
        if (heUpdate) {
          u.headline_he = heUpdate.headline_he || u.headline;
        }
      });
    }

    console.log('[TRANSLATE]   ✅ Sitrep translated');
  } catch (err) {
    console.error(`[TRANSLATE]   ⚠️ Sitrep translation failed: ${err.message}. Keeping English.`);
    // Fallback
    sitrep.summary_he = sitrep.summary;
    sitrep.detailed_analysis_he = sitrep.detailed_analysis;
    if (sitrep.top_updates) {
      sitrep.top_updates.forEach(u => { u.headline_he = u.headline; });
    }
  }
}

/**
 * Translate developments to Hebrew. Mutates developments in-place,
 * adding headline_he and summary_he fields.
 *
 * @param {object} model - Gemini model instance
 * @param {Array} developments - Array of development objects
 */
async function translateDevelopments(model, developments) {
  if (!developments || developments.length === 0) return;

  console.log(`[TRANSLATE] 🔍 Translating ${developments.length} developments...`);

  try {
    const items = developments.map((d, i) =>
      `[${i}] Headline: ${d.headline}\nSummary: ${d.summary}`
    ).join('\n\n');

    const prompt = `You are a professional Hebrew translator for a military intelligence dashboard.

Translate these key developments from English to Hebrew.
- Use formal Hebrew news/intelligence style
- Keep proper nouns in their standard Hebrew forms
- Maintain the same severity and tone

Developments:
${items}

Return ONLY valid JSON (no markdown fences) as an array:
[
  { "index": 0, "headline_he": "Hebrew headline", "summary_he": "Hebrew summary" },
  ...
]

Important: Return ALL ${developments.length} items.`;

    let text = await callGeminiWithRetry(model, prompt);
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const translations = repairJson(text);

    for (const tr of translations) {
      if (developments[tr.index]) {
        developments[tr.index].headline_he = tr.headline_he || developments[tr.index].headline;
        developments[tr.index].summary_he = tr.summary_he || developments[tr.index].summary;
      }
    }

    console.log('[TRANSLATE]   ✅ Developments translated');
  } catch (err) {
    console.error(`[TRANSLATE]   ⚠️ Developments translation failed: ${err.message}. Keeping English.`);
    // Fallback
    developments.forEach(d => {
      d.headline_he = d.headline;
      d.summary_he = d.summary;
    });
  }
}

/**
 * Translate a daily briefing to Hebrew. Mutates briefing in-place,
 * adding _he fields for headline, summary, outlook, what_changed, and key_events.
 *
 * @param {object} model - Gemini model instance
 * @param {object} briefing - Daily briefing object
 */
async function translateDailyBriefing(model, briefing) {
  if (!briefing) return;
  console.log('[TRANSLATE] 📋 Translating daily briefing...');
  try {
    const prompt = `You are a professional Hebrew translator for a military intelligence dashboard.

Translate this daily intelligence briefing from English to Hebrew.
- Use formal military/intelligence Hebrew style
- Keep HTML tags (<p>, <strong>) intact
- Keep proper nouns in standard Hebrew forms

Content:
Headline: ${briefing.headline}
Summary: ${briefing.summary}
Outlook: ${briefing.outlook || ''}
What Changed: ${JSON.stringify(briefing.what_changed || [])}
Key Events:
${(briefing.key_events || []).map((e, i) => i + '. Headline: ' + e.headline + ' | Description: ' + (e.description || '')).join('\n')}

Return ONLY valid JSON (no markdown fences):
{
  "headline_he": "Hebrew headline",
  "summary_he": "Hebrew summary with HTML tags preserved",
  "outlook_he": "Hebrew outlook",
  "what_changed_he": ["Hebrew item 1", "Hebrew item 2", "Hebrew item 3"],
  "key_events_he": [
    {"headline_he": "Hebrew headline", "description_he": "Hebrew description"},
    ...
  ]
}`;

    let text = await callGeminiWithRetry(model, prompt);
    text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const tr = repairJson(text);

    briefing.headline_he = tr.headline_he || briefing.headline;
    briefing.summary_he = tr.summary_he || briefing.summary;
    briefing.outlook_he = tr.outlook_he || briefing.outlook;
    briefing.what_changed_he = tr.what_changed_he || briefing.what_changed;
    if (tr.key_events_he && briefing.key_events) {
      briefing.key_events.forEach((ev, i) => {
        const heEv = tr.key_events_he[i];
        if (heEv) {
          ev.headline_he = heEv.headline_he || ev.headline;
          ev.description_he = heEv.description_he || ev.description;
        }
      });
    }
    console.log('[TRANSLATE]   ✅ Daily briefing translated');
  } catch (err) {
    console.error('[TRANSLATE]   ⚠️ Daily briefing translation failed:', err.message);
    briefing.headline_he = briefing.headline;
    briefing.summary_he = briefing.summary;
    briefing.outlook_he = briefing.outlook;
    briefing.what_changed_he = briefing.what_changed;
    if (briefing.key_events) briefing.key_events.forEach(ev => { ev.headline_he = ev.headline; ev.description_he = ev.description; });
  }
}

module.exports = {
  isHebrew,
  initModel,
  translateArticles,
  translateSitrep,
  translateDevelopments,
  translateDailyBriefing
};

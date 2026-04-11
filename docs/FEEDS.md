# Feed Reference — Middle East Pulse

Documentation of all configured RSS feeds, their quirks, and how to manage them.

---

## Active Feeds

### 🇮🇱 Ynet News

| Property | Value |
|----------|-------|
| **URL** | `https://www.ynet.co.il/Integration/StoryRss1854.xml` |
| **Favicon** | `ynet.co.il` |
| **Keywords** | None (region-specific feed — accepts all articles) |
| **Stale limit** | None |
| **Special flags** | None |

**Notes**: Israel's largest Hebrew-language news site. This RSS endpoint is the English feed. Highly reliable, fast to update. No known quirks. Ynet's article URLs use the `ynet.co.il` domain, which iOS Universal Links will try to open in-app — this is handled by the JS-driven article card tap handler (no native `<a>` tags).

---

### 📈 CNBC

| Property | Value |
|----------|-------|
| **URL** | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362` |
| **Favicon** | `cnbc.com` |
| **Keywords** | israel, gaza, hamas, hezbollah, iran, lebanon, middle east, idf, hostage, ceasefire, netanyahu, palestinian, west bank, war, beirut, houthi, yemen, syria, hormuz, sanctions, oil, tehran |
| **Stale limit** | None |
| **Special flags** | None |

**Notes**: CNBC's world news feed covers broad financial and geopolitical topics. The keyword filter narrows it to Middle East conflict stories. Particularly useful for sanctions, oil market, and economic angle stories. Reliable feed, clean XML. Replaced CNN as the US financial news source.

---

### 🦊 Fox News

| Property | Value |
|----------|-------|
| **URL** | `https://moxie.foxnews.com/google-publisher/world.xml` |
| **Favicon** | `foxnews.com` |
| **Keywords** | israel, gaza, hamas, hezbollah, iran, lebanon, middle east, idf, hostage, ceasefire, netanyahu, palestinian, west bank, tel aviv, jerusalem, beirut, tehran, houthi, yemen, syria, war |
| **Stale limit** | None |
| **Special flags** | None |

**Notes**: World news feed from Fox. Keyword-filtered for conflict stories. Useful for US political angle (Congressional positions on Israel aid, Iran sanctions, etc.). Clean XML, reliable. The `moxie.foxnews.com` Google Publisher feed is more stable than their main RSS.

---

### 🇬🇧 BBC News

| Property | Value |
|----------|-------|
| **URL** | `https://feeds.bbci.co.uk/news/world/middle_east/rss.xml` |
| **Favicon** | `bbc.com` |
| **Keywords** | None (region-specific feed — accepts all articles) |
| **Stale limit** | None |
| **Special flags** | None |

**Notes**: BBC's dedicated Middle East RSS feed. Very reliable, clean XML, good international perspective. No quirks. Typically publishes 10–15 relevant articles per cycle.

---

### 🌍 Al Jazeera

| Property | Value |
|----------|-------|
| **URL** | `https://www.aljazeera.com/xml/rss/all.xml` |
| **Favicon** | `aljazeera.com` |
| **Keywords** | israel, gaza, hamas, hezbollah, iran, lebanon, middle east, idf, hostage, ceasefire, netanyahu, palestinian, west bank, war, beirut, houthi, yemen, syria |
| **Stale limit** | None |
| **Special flags** | None |

**Notes**: Al Jazeera's full RSS feed covers all world news; keyword-filtered for conflict stories. Strong Gaza/Palestinian perspective. Reliable XML. Occasionally slow to update during off-hours (Qatar timezone). Generally 10–15 articles per cycle.

---

### 🎙️ NPR

| Property | Value |
|----------|-------|
| **URL** | `https://feeds.npr.org/1004/rss.xml` |
| **Favicon** | `npr.org` |
| **Keywords** | israel, gaza, hamas, hezbollah, iran, lebanon, middle east, idf, hostage, ceasefire, netanyahu, palestinian, west bank, war, beirut, houthi, yemen, syria |
| **Stale limit** | None |
| **Special flags** | None |

**Notes**: NPR's world news podcast/article feed. Lower volume (~5 articles per cycle) but high editorial quality. Good for diplomatic and humanitarian angle stories. Clean XML. Sometimes fewer articles because NPR publishes less frequently than wire services.

---

### 🕎 Times of Israel

| Property | Value |
|----------|-------|
| **URL** | `https://www.timesofisrael.com/feed/` |
| **Favicon** | `timesofisrael.com` |
| **Keywords** | None (region-specific feed — accepts all articles) |
| **Stale limit** | None |
| **Special flags** | None |

**Notes**: English-language Israeli news site with strong national security coverage. One of the most reliable and prolific feeds — consistently 13–15 articles per cycle. Clean XML, accurate timestamps, no known quirks. Excellent for IDF operations, hostage negotiations, and domestic Israeli politics.

---

### 📜 Jerusalem Post

| Property | Value |
|----------|-------|
| **URL** | `https://www.jpost.com/rss/rssfeedsfrontpage.aspx` |
| **Favicon** | `jpost.com` |
| **Keywords** | None (region-specific feed — accepts all articles) |
| **Stale limit** | None |
| **Special flags** | `fixFutureDates: true` |

**Notes**: English-language Israeli newspaper. **Known quirk: IDT/IST mislabeled as GMT.** All pubDate values in the RSS are in Israel local time but labeled `GMT`. This causes articles to appear 2–3 hours in the future. Fixed by `correctJPostTimezone()` in `src/fetcher.js` — see [ARCHITECTURE.md](./ARCHITECTURE.md#timestamp-handling--timezone-corrections) for details.

JPost also occasionally pre-schedules articles in the RSS feed before they go live. These are handled by scraping the article page for the real `datePublished` when detected.

---

## Disabled Feeds

### 📰 Haaretz

| Property | Value |
|----------|-------|
| **URL** | `https://www.haaretz.com/cmlink/1.4478498` |
| **Status** | **DISABLED** (`disabled: true` in config) |
| **Reason** | Paywall |

**Notes**: Haaretz's RSS endpoint returns a full 1.3 MB HTML paywall page to all non-whitelisted user agents. Their Varnish CDN either 403s or serves HTML — no valid XML is ever returned. The feed entry is kept in `src/config.js` with `disabled: true` to document the decision. Do not re-enable without finding a working RSS URL (e.g., behind a subscription cookie or a separate public endpoint).

The filter bar still lists Haaretz because `src/feeds.json` (the Astro-facing metadata file) predates the `disabled` flag. If re-enabling, update both `src/config.js` and `src/feeds.json`.

---

## Removed Feeds

### CNN (Removed ~2024)

CNN's RSS infrastructure was largely abandoned around 2024. Their remaining feeds (`rss.cnn.com`) return either:
- Section navigation links (single-word titles like "Iran", "Israel" with `/specials/` URLs)
- Articles frozen from 2024 with no `pubDate`

The codebase retains `cnnTitleFix` and `dropNoDate` flags in `src/fetcher.js` as documented legacy code. Do not re-add CNN as a feed.

**Replacement**: CNBC provides better US-perspective financial/policy coverage of the conflict.

---

## How to Add a New Feed

### 1. Test the RSS URL

Check that the URL returns valid RSS/Atom XML:
```bash
curl -s "https://example.com/rss.xml" | head -50
```

Look for `<rss>` or `<feed>` at the top. If you see HTML, it's either broken or behind auth.

### 2. Check for Quirks

Common issues to test for:
- **Timezone bugs**: Does the feed mislabel timestamps? (Check `pubDate` vs. actual article publish time)
- **Malformed XML**: Does the XML have unescaped `&` or bare `<` in text fields? Set `sanitizeXml: true`.
- **Future-dated articles**: Does the feed pre-schedule articles? Set `fixFutureDates: true`.
- **Broad feed**: Does the feed cover all world news? Add a `keywords` array.

### 3. Add to `src/config.js`

```js
{
  name: 'Reuters',
  shortName: 'Reuters',
  url: 'https://feeds.reuters.com/reuters/worldNews',
  emoji: '📡',
  faviconDomain: 'reuters.com',
  color: '#ff6600',
  accentLight: '#fff8f0',
  keywords: ['israel', 'gaza', 'hamas', 'iran', 'middle east', ...],
  staleThresholdHours: null
}
```

### 4. Add to `src/feeds.json`

```json
{
  "name": "Reuters",
  "shortName": "Reuters",
  "faviconDomain": "reuters.com"
}
```

### 5. Test

```bash
node fetch-data.js
```

Check output for `✓ Reuters: N articles` and verify no errors.

---

## How to Remove a Feed

1. Either set `disabled: true` in `src/config.js` (keeps the entry for documentation) or remove the entry entirely
2. Remove from `src/feeds.json` if you want it off the filter bar
3. Run `node build.js` to rebuild the site

---

## Feed Health Monitoring

Each fetch cycle logs a source breakdown:

```
[DATA] ✅ Sources: 8 OK, 1 failed
[DATA] ⚠️  Failed: Haaretz
```

Check `logs/fetch-data.log` for individual feed errors:
```
  ✗ Haaretz: Unencoded < Line: 105 Column: 2209
  ✓ BBC News: 15 articles
  ✓ Times of Israel: 13 articles
```

A feed failing on one cycle is normal (network blip, retry logic handles it). Consistent failure across many cycles indicates the feed URL or endpoint has changed.

---

## Feed Keyword Reference

Keywords are matched case-insensitively against `title + contentSnippet + content`. A single match is sufficient to include the article.

**Current keyword set** (used by CNBC, Fox, NPR, Al Jazeera):
```
israel, gaza, hamas, hezbollah, iran, lebanon, middle east, idf,
hostage, ceasefire, netanyahu, palestinian, west bank, war, beirut,
houthi, yemen, syria, hormuz, sanctions, oil, tehran
```

Feeds without keywords accept all articles — use this for region-specific outlets (Ynet, ToI, JPost, BBC Middle East) where everything is relevant by definition.

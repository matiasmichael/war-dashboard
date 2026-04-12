// ===== I18N TRANSLATION DICTIONARY =====
// Central translation file for all UI strings.
// English is the default; Hebrew provides full RTL translation.

export const languages = {
  en: 'English',
  he: 'עברית',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'en';

// All translatable UI strings
export const ui = {
  en: {
    // ===== Site-wide =====
    'site.title': 'Middle East Pulse',
    'site.description': 'Middle East Pulse — live conflict news and intelligence briefings from leading sources',
    'site.subtitle': '🇮🇱 IDT',

    // ===== Header =====
    'header.live': 'LIVE',
    'header.stale': 'STALE',
    'header.lastUpdated': 'Last updated',
    'header.videos': 'Videos',
    'header.archive': 'Archive',

    // ===== Navigation =====
    'nav.liveFeed': '← Live Feed',
    'nav.backToLive': '← Back to Live Dashboard',

    // ===== FilterBar =====
    'filter.latestArticles': 'Latest Articles',
    'filter.all': 'All',
    'filter.articlesShown': 'articles shown',

    // ===== ArticleCard =====
    'article.breaking': '⚡ Breaking',
    'article.readFull': 'Read Full Article',
    'article.share': 'Share',
    'article.justNow': 'just now',

    // ===== SitrepCard =====
    'sitrep.badge': 'SITUATION REPORT',
    'sitrep.seeFullBriefing': 'See full briefing',
    'sitrep.disclaimer': 'AI-synthesized briefing · All sources',
    'sitrep.unavailable': 'AI synthesis unavailable — showing articles only. The briefing will return on the next successful update.',

    // ===== DevelopmentsGrid =====
    'dev.keyDevelopments': 'Key Developments',
    'dev.aiSynthesized': 'AI-synthesized',

    // ===== Index page =====
    'index.title': 'Middle East Pulse — Live News Dashboard',
    'index.newUpdates': '🔄 New updates available — tap to refresh',

    // ===== Videos page =====
    'videos.title': 'Videos — Middle East Pulse',
    'videos.description': 'Key speeches and updates from major leaders — Israeli PM, IDF, White House, and more.',
    'videos.subtitle': '🎬 Video Feed',
    'videos.heading': '🎬 Video Feed',
    'videos.refreshNote': 'Key speeches and updates from major leaders — refreshed every 3 minutes.',
    'videos.noVideos': 'No videos yet',
    'videos.noVideosDesc': 'Videos from key channels will appear here once the first fetch runs.',
    'videos.play': '▶ Play',
    'videos.all': 'All',
    'videos.closeVideo': 'Close video',

    // ===== Archive page =====
    'archive.title': 'Daily Briefing — Middle East Pulse',
    'archive.description': 'Historical daily intelligence briefings from the Middle East conflict',
    'archive.heading': '📅 Daily Briefing',
    'archive.loading': 'Loading briefing...',
    'archive.jsRequired': 'JavaScript Required',
    'archive.jsRequiredDesc': 'This page requires JavaScript to load daily briefings. Please enable JavaScript in your browser settings.',
    'archive.noYet': 'No briefings yet',
    'archive.noYetDesc': 'Daily intelligence summaries will appear here once the first daily summary is generated. Check back tomorrow.',
    'archive.notAvailable': 'Briefing not available',
    'archive.notAvailableDesc': "The daily summary for this date couldn't be loaded. It may not have been generated yet.",
    'archive.previous': '← Previous',
    'archive.next': 'Next →',
    'archive.dataNotes': 'Data Notes',
    'archive.articles': 'articles',
    'archive.sources': 'sources',
    'archive.mostActive': 'most active',
    'archive.generatedAt': 'Briefing generated at',
    'archive.dailyBriefing': 'Daily Intelligence Briefing',
    'archive.outlook': '🔮 Outlook',
    'archive.keyEvents': '⏱️ Key Events',
    'archive.noKeyEvents': 'No key events recorded.',
    'archive.dailySummary': '📋 Daily Summary',
    'archive.noSummary': 'No summary available.',
    'archive.whatChanged': '⚡ What Changed Today',

    // Escalation levels
    'escalation.calm': 'Calm',
    'escalation.tensions': 'Tensions',
    'escalation.activeConflict': 'Active Conflict',
    'escalation.majorEscalation': 'Major Escalation',
    'escalation.fullScaleWar': 'Full-Scale War',

    // Categories
    'category.diplomacy': 'Diplomacy',
    'category.military': 'Military',
    'category.intelligence': 'Intelligence',
    'category.proxy': 'Proxy',

    // ===== About page =====
    'about.title': 'About — Middle East Pulse',
    'about.description': 'How Middle East Pulse works: multi-source news aggregation and AI-powered intelligence synthesis for the Iran-Israel conflict.',
    'about.subtitle': 'About this site',
    'about.heroDesc': 'A live intelligence dashboard tracking the Iran-Israel conflict — aggregated from 8 leading news sources and synthesized by AI every hour.',
    'about.whatIsIt': 'What is Middle East Pulse?',
    'about.whatIsItP1': 'Middle East Pulse is a personal news dashboard built to track one conflict in real time, without the noise of a general news site. It pulls articles from eight major outlets simultaneously, filters for relevance, and presents them in a clean, chronological feed.',
    'about.whatIsItP2': "At the top of the page, an AI model reads all the recent headlines and writes a concise intelligence briefing — the kind of summary that would take you 20 minutes of reading to piece together yourself. It's updated automatically every hour.",
    'about.howItWorks': 'How It Works',
    'about.step1Title': 'Article collection — every 3 minutes',
    'about.step1Desc': 'Eight RSS feeds are fetched in parallel. Articles are deduplicated by URL, timestamps are normalized, and results are stored locally. Sources that cover broad world news (CNBC, NPR, Fox, Al Jazeera) are filtered by conflict-relevant keywords before being included.',
    'about.step2Title': 'Key developments — every 3 minutes',
    'about.step2Desc': 'After each fetch, Google Gemini reads the top 25 most recent articles and identifies the 4 most significant and distinct events. Each development is ranked by severity (critical, major, notable, developing) and categorized by type (military, diplomacy, humanitarian, economic).',
    'about.step3Title': 'Intelligence briefing — every hour',
    'about.step3Desc': 'Once per hour, Gemini reads the full day\'s accumulated articles and writes a structured intelligence report: a 40-word situation summary, the 3 most operationally significant stories, and a deeper analysis covering force posture, proxy activity, nuclear dimensions, and key watch items.',
    'about.step4Title': 'Static site build — after every synthesis',
    'about.step4Desc': "The site is rebuilt as plain HTML after each AI synthesis. There's no live data fetching in your browser — what you see is a snapshot baked into the page at build time. Timestamps update live in the browser (re-computed every 30 seconds), but the articles themselves are from the last build.",
    'about.sources': 'Sources',
    'about.activeFeeds': 'active feeds',
    'about.sourcesDesc': 'All sources are major international or Israeli news outlets with dedicated Middle East coverage. Ynet, Times of Israel, and Jerusalem Post are Israeli outlets. BBC and NPR provide international perspective. Al Jazeera provides regional Arab coverage. CNBC and Fox News add US financial and political angles.',
    'about.updateSchedule': 'Update Schedule',
    'about.articlesSchedule': 'Articles',
    'about.articlesFreq': '— refreshed every 3 minutes',
    'about.keyDevSchedule': 'Key Developments',
    'about.keyDevFreq': '— re-synthesized every 3 minutes',
    'about.sitrepSchedule': 'Situation Report',
    'about.sitrepFreq': '— regenerated every hour',
    'about.dailyBriefingSchedule': 'Daily Briefing',
    'about.dailyBriefingFreq': '— archived at 23:55 IDT each night',
    'about.liveIndicatorNote': "The LIVE indicator in the header turns yellow if the last build was more than 15 minutes ago, and grey (\"STALE\") if it's been over an hour. A \"New updates available\" prompt will appear automatically after you've had the page open for 1 hour.",
    'about.aiDisclaimer': '⚠️ AI Disclaimer',
    'about.aiDisclaimerP1': 'The Situation Report and Key Developments sections are generated by Google Gemini, an AI language model. They are based solely on the RSS headlines and snippets collected in that cycle.',
    'about.aiDisclaimerP2': 'AI summaries can contain errors, omissions, or outdated information. They reflect the framing of their source articles, which may themselves contain inaccuracies. Do not use this dashboard as your sole source of information for any important decision.',
    'about.aiDisclaimerP3': 'The article feed itself is a straight pass-through of headlines and snippets from the original publishers — no AI editing is applied to individual articles.',
    'about.archiveSection': 'Daily Briefing Archive',
    'about.archiveSectionDesc': 'Each night, a comprehensive daily intelligence briefing is generated and preserved in the archive. It includes an escalation assessment, a timeline of key events, a full narrative summary, and "what changed today" notes.',
    'about.viewArchive': '📅 View Archive',

    // ===== Footer =====
    'footer.line1': 'Middle East Pulse · Aggregated from public RSS feeds · Updated every hour',
    'footer.line2': 'hmviva.us',
  },

  he: {
    // ===== Site-wide =====
    'site.title': 'מד הדופק — המזרח התיכון',
    'site.description': 'מד הדופק — חדשות עימות בזמן אמת ותדריכי מודיעין ממקורות מובילים',
    'site.subtitle': '🇮🇱 שעון ישראל',

    // ===== Header =====
    'header.live': 'שידור חי',
    'header.stale': 'לא עדכני',
    'header.lastUpdated': 'עודכן לאחרונה',
    'header.videos': 'סרטונים',
    'header.archive': 'ארכיון',

    // ===== Navigation =====
    'nav.liveFeed': 'פיד חי →',
    'nav.backToLive': 'חזרה ללוח הבקרה →',

    // ===== FilterBar =====
    'filter.latestArticles': 'כתבות אחרונות',
    'filter.all': 'הכל',
    'filter.articlesShown': 'כתבות מוצגות',

    // ===== ArticleCard =====
    'article.breaking': '⚡ מבזק',
    'article.readFull': 'לכתבה המלאה',
    'article.share': 'שתף',
    'article.justNow': 'עכשיו',

    // ===== SitrepCard =====
    'sitrep.badge': 'דו״ח מצב',
    'sitrep.seeFullBriefing': 'לתדריך המלא',
    'sitrep.disclaimer': 'תדריך מסונתז בינה מלאכותית · כל המקורות',
    'sitrep.unavailable': 'סינתוז AI אינו זמין — מציג כתבות בלבד. התדריך יחזור בעדכון הבא.',

    // ===== DevelopmentsGrid =====
    'dev.keyDevelopments': 'התפתחויות מרכזיות',
    'dev.aiSynthesized': 'סינתוז AI',

    // ===== Index page =====
    'index.title': 'מד הדופק — לוח חדשות חי',
    'index.newUpdates': '🔄 עדכונים חדשים זמינים — הקש לרענון',

    // ===== Videos page =====
    'videos.title': 'סרטונים — מד הדופק',
    'videos.description': 'נאומים ועדכונים מרכזיים ממנהיגי העולם — ראש ממשלת ישראל, צה"ל, הבית הלבן ועוד.',
    'videos.subtitle': '🎬 פיד סרטונים',
    'videos.heading': '🎬 פיד סרטונים',
    'videos.refreshNote': 'נאומים ועדכונים מרכזיים ממנהיגים — מתרענן כל 3 דקות.',
    'videos.noVideos': 'אין סרטונים עדיין',
    'videos.noVideosDesc': 'סרטונים מערוצים מרכזיים יופיעו כאן לאחר האיסוף הראשון.',
    'videos.play': '▶ נגן',
    'videos.all': 'הכל',
    'videos.closeVideo': 'סגור סרטון',

    // ===== Archive page =====
    'archive.title': 'תדריך יומי — מד הדופק',
    'archive.description': 'תדריכי מודיעין יומיים היסטוריים מעימות המזרח התיכון',
    'archive.heading': '📅 תדריך יומי',
    'archive.loading': 'טוען תדריך...',
    'archive.jsRequired': 'נדרש JavaScript',
    'archive.jsRequiredDesc': 'עמוד זה דורש JavaScript כדי לטעון תדריכים יומיים. אנא הפעל JavaScript בהגדרות הדפדפן שלך.',
    'archive.noYet': 'אין תדריכים עדיין',
    'archive.noYetDesc': 'סיכומי מודיעין יומיים יופיעו כאן לאחר שיופק הסיכום היומי הראשון. בדוק שוב מחר.',
    'archive.notAvailable': 'התדריך אינו זמין',
    'archive.notAvailableDesc': 'לא ניתן היה לטעון את הסיכום היומי לתאריך זה. ייתכן שהוא טרם הופק.',
    'archive.previous': 'הקודם →',
    'archive.next': '← הבא',
    'archive.dataNotes': 'הערות נתונים',
    'archive.articles': 'כתבות',
    'archive.sources': 'מקורות',
    'archive.mostActive': 'הכי פעיל',
    'archive.generatedAt': 'התדריך הופק ב-',
    'archive.dailyBriefing': 'תדריך מודיעין יומי',
    'archive.outlook': '🔮 תחזית',
    'archive.keyEvents': '⏱️ אירועים מרכזיים',
    'archive.noKeyEvents': 'לא תועדו אירועים מרכזיים.',
    'archive.dailySummary': '📋 סיכום יומי',
    'archive.noSummary': 'אין סיכום זמין.',
    'archive.whatChanged': '⚡ מה השתנה היום',

    // Escalation levels
    'escalation.calm': 'רגוע',
    'escalation.tensions': 'מתיחות',
    'escalation.activeConflict': 'עימות פעיל',
    'escalation.majorEscalation': 'הסלמה משמעותית',
    'escalation.fullScaleWar': 'מלחמה כוללת',

    // Categories
    'category.diplomacy': 'דיפלומטיה',
    'category.military': 'צבאי',
    'category.intelligence': 'מודיעין',
    'category.proxy': 'שלוחות',

    // ===== About page =====
    'about.title': 'אודות — מד הדופק',
    'about.description': 'כיצד מד הדופק עובד: צבירת חדשות ממקורות מרובים וסינתוז מודיעין מבוסס AI לעימות איראן-ישראל.',
    'about.subtitle': 'אודות האתר',
    'about.heroDesc': 'לוח מודיעין חי העוקב אחר עימות איראן-ישראל — מצובר מ-8 מקורות חדשותיים מובילים ומסונתז על ידי AI כל שעה.',
    'about.whatIsIt': 'מהו מד הדופק?',
    'about.whatIsItP1': 'מד הדופק הוא לוח חדשות אישי שנבנה לעקוב אחר עימות אחד בזמן אמת, ללא הרעש של אתר חדשות כללי. הוא שואב כתבות משמונה מקורות בו-זמנית, מסנן לרלוונטיות ומציג אותן בפיד נקי וכרונולוגי.',
    'about.whatIsItP2': 'בראש העמוד, מודל AI קורא את כל הכותרות האחרונות וכותב תדריך מודיעין תמציתי — סוג הסיכום שלוקח לך 20 דקות קריאה להרכיב בעצמך. הוא מתעדכן אוטומטית כל שעה.',
    'about.howItWorks': 'איך זה עובד',
    'about.step1Title': 'איסוף כתבות — כל 3 דקות',
    'about.step1Desc': 'שמונה הזנות RSS נשלפות במקביל. כתבות מנוכות כפילויות לפי URL, חותמות זמן מנורמלות, והתוצאות נשמרות מקומית. מקורות המכסים חדשות עולמיות רחבות מסוננים לפי מילות מפתח רלוונטיות לעימות.',
    'about.step2Title': 'התפתחויות מרכזיות — כל 3 דקות',
    'about.step2Desc': 'לאחר כל שליפה, Google Gemini קורא את 25 הכתבות האחרונות ומזהה את 4 האירועים המשמעותיים ביותר. כל התפתחות מדורגת לפי חומרה ומסווגת לפי סוג.',
    'about.step3Title': 'תדריך מודיעין — כל שעה',
    'about.step3Desc': 'פעם בשעה, Gemini קורא את מלוא הכתבות שנצברו ביום וכותב דו"ח מודיעין מובנה: סיכום מצב של 40 מילים, 3 הסיפורים המשמעותיים ביותר מבחינה מבצעית, וניתוח מעמיק.',
    'about.step4Title': 'בניית אתר סטטי — אחרי כל סינתוז',
    'about.step4Desc': 'האתר נבנה מחדש כ-HTML רגיל לאחר כל סינתוז AI. אין שליפת נתונים חיה בדפדפן שלך — מה שאתה רואה הוא תמונת מצב שנאפתה בעת הבנייה. חותמות זמן מתעדכנות חיות בדפדפן (מחושבות מחדש כל 30 שניות).',
    'about.sources': 'מקורות',
    'about.activeFeeds': 'הזנות פעילות',
    'about.sourcesDesc': 'כל המקורות הם מקורות חדשותיים בינלאומיים או ישראליים מרכזיים עם כיסוי מזרח תיכוני ייעודי.',
    'about.updateSchedule': 'לוח עדכונים',
    'about.articlesSchedule': 'כתבות',
    'about.articlesFreq': '— מתרענן כל 3 דקות',
    'about.keyDevSchedule': 'התפתחויות מרכזיות',
    'about.keyDevFreq': '— מסונתז מחדש כל 3 דקות',
    'about.sitrepSchedule': 'דו"ח מצב',
    'about.sitrepFreq': '— מופק מחדש כל שעה',
    'about.dailyBriefingSchedule': 'תדריך יומי',
    'about.dailyBriefingFreq': '— נארכב ב-23:55 שעון ישראל כל לילה',
    'about.liveIndicatorNote': 'מחוון השידור החי בכותרת הופך לצהוב אם הבנייה האחרונה היתה לפני יותר מ-15 דקות, ולאפור ("לא עדכני") אם חלפה יותר משעה.',
    'about.aiDisclaimer': '⚠️ הבהרת AI',
    'about.aiDisclaimerP1': 'חלקי דו"ח המצב וההתפתחויות המרכזיות מופקים על ידי Google Gemini, מודל שפה של בינה מלאכותית. הם מבוססים אך ורק על כותרות ותקצירי RSS שנאספו במחזור זה.',
    'about.aiDisclaimerP2': 'סיכומי AI עלולים להכיל שגיאות, השמטות או מידע לא עדכני. אל תשתמש בלוח הבקרה הזה כמקור מידע יחיד לכל החלטה חשובה.',
    'about.aiDisclaimerP3': 'פיד הכתבות עצמו הוא העברה ישירה של כותרות ותקצירים מהמפרסמים המקוריים — ללא עריכת AI על כתבות בודדות.',
    'about.archiveSection': 'ארכיון תדריכים יומיים',
    'about.archiveSectionDesc': 'כל לילה, תדריך מודיעין יומי מקיף מופק ונשמר בארכיון. הוא כולל הערכת הסלמה, ציר זמן של אירועים מרכזיים, סיכום נרטיבי מלא והערות "מה השתנה היום".',
    'about.viewArchive': '📅 צפה בארכיון',

    // ===== Footer =====
    'footer.line1': 'מד הדופק · מצובר מהזנות RSS ציבוריות · מתעדכן כל שעה',
    'footer.line2': 'hmviva.us',
  },
} as const;

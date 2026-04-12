// ===== I18N UTILITY FUNCTIONS =====
// Helpers for translation lookups and locale detection.

import { ui, defaultLang, type Lang } from './ui';

/**
 * Get a translated string by key for the given language.
 * Falls back to English if the key doesn't exist in the target language.
 */
export function t(lang: Lang, key: string): string {
  const translations = ui[lang] || ui[defaultLang];
  return (translations as any)[key] || (ui[defaultLang] as any)[key] || key;
}

/**
 * Detect language from Astro URL path.
 * /he/... → 'he'
 * /... → 'en' (default)
 */
export function getLangFromUrl(url: URL): Lang {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'he') return 'he';
  return defaultLang;
}

/**
 * Check if a language is RTL.
 */
export function isRtl(lang: Lang): boolean {
  return lang === 'he';
}

/**
 * Get the URL prefix for a language.
 * 'en' → '' (no prefix, default)
 * 'he' → '/he'
 */
export function getLangPrefix(lang: Lang): string {
  if (lang === defaultLang) return '';
  return `/${lang}`;
}

/**
 * Build a localized path.
 * localizedPath('he', '/videos') → '/he/videos'
 * localizedPath('en', '/videos') → '/videos'
 */
export function localizedPath(lang: Lang, path: string): string {
  const prefix = getLangPrefix(lang);
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${prefix}${cleanPath}`;
}

/**
 * Get the alternate language.
 */
export function getAlternateLang(lang: Lang): Lang {
  return lang === 'en' ? 'he' : 'en';
}

/**
 * Get the URL for switching languages on the current page.
 */
export function getSwitchLangUrl(currentUrl: URL, targetLang: Lang): string {
  const segments = currentUrl.pathname.split('/').filter(Boolean);
  // Remove existing lang prefix if present
  if (segments[0] === 'he') {
    segments.shift();
  }
  const basePath = '/' + segments.join('/');
  return localizedPath(targetLang, basePath || '/');
}

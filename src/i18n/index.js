/**
 * i18n module -- lightweight locale management
 *
 * Usage:
 *   import { t, getLocale, setLocale, f } from '../i18n/index.js';
 *
 *   t('viewTimeline')          → "时间线" or "Timeline"
 *   t('chapterN', { n: 3 })   → "第3章" or "Ch.3"
 *   f(obj, 'name')            → obj.name (zh) or obj.name_en (en)
 */
import zh from './zh.js';
import en from './en.js';

const LOCALES = { zh, en };
const STORAGE_KEY = 'us-history-locale';
const DEFAULT_LOCALE = 'zh';

/**
 * Get the current locale ('zh' or 'en')
 */
export function getLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALES[stored]) return stored;
  } catch (_) { /* localStorage not available */ }
  return DEFAULT_LOCALE;
}

/**
 * Set locale and reload the page
 */
export function setLocale(lang) {
  if (!LOCALES[lang]) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (_) { /* ignore */ }
  location.reload();
}

/**
 * Translate a UI string key, with optional interpolation.
 *   t('chapterN', { n: 3 })  → "第3章"
 */
export function t(key, params) {
  const locale = getLocale();
  let str = LOCALES[locale]?.[key] ?? LOCALES[DEFAULT_LOCALE]?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

/**
 * Read a locale-aware field from a data object.
 *   f(charObj, 'name')  → charObj.name (zh) or charObj.name_en (en), falling back to charObj.name
 *   f(charObj, 'bio')   → charObj.bio  (zh) or charObj.bio_en  (en), falling back to charObj.bio
 */
export function f(obj, field) {
  if (!obj) return '';
  const locale = getLocale();
  if (locale !== 'zh') {
    const enField = `${field}_en`;
    if (obj[enField] !== undefined && obj[enField] !== '') return obj[enField];
  }
  return obj[field] ?? '';
}

/**
 * Check if current locale is English
 */
export function isEn() {
  return getLocale() === 'en';
}

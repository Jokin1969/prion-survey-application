import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supported languages
export const SUPPORTED_LANGUAGES = ['es', 'ca', 'en', 'eu'];
export const DEFAULT_LANGUAGE = 'es';

// Cache for translations
const translationsCache = {};

/**
 * Load translations for a specific language
 * @param {string} lang - Language code
 * @returns {Object} Translations object
 */
export function loadTranslations(lang) {
  // Validate language
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    lang = DEFAULT_LANGUAGE;
  }

  // Return from cache if available
  if (translationsCache[lang]) {
    return translationsCache[lang];
  }

  try {
    const localesPath = path.join(__dirname, '..', 'locales', `${lang}.json`);
    const translations = JSON.parse(fs.readFileSync(localesPath, 'utf-8'));
    translationsCache[lang] = translations;
    return translations;
  } catch (error) {
    console.error(`Error loading translations for ${lang}:`, error.message);
    // Fallback to default language
    if (lang !== DEFAULT_LANGUAGE) {
      return loadTranslations(DEFAULT_LANGUAGE);
    }
    return {};
  }
}

/**
 * Get all translations for all languages
 * @returns {Object} Object with all translations
 */
export function getAllTranslations() {
  const allTranslations = {};
  SUPPORTED_LANGUAGES.forEach(lang => {
    allTranslations[lang] = loadTranslations(lang);
  });
  return allTranslations;
}

/**
 * Get translation for a specific key
 * @param {string} lang - Language code
 * @param {string} key - Translation key (e.g., 'app.title')
 * @returns {string} Translated string
 */
export function translate(lang, key) {
  const translations = loadTranslations(lang);
  const keys = key.split('.');
  let value = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key; // Return key if translation not found
    }
  }

  return value;
}

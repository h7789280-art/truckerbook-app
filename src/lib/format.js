const LOCALE_MAP = {
  ru: 'ru-RU',
  uk: 'uk-UA',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  tr: 'tr-TR',
  pl: 'pl-PL',
}

export function getLocale(lang) {
  return LOCALE_MAP[lang] || 'en-US'
}

export function formatNumber(value, lang, options = {}) {
  if (value == null || isNaN(value)) return ''
  return Number(value).toLocaleString(getLocale(lang), options)
}

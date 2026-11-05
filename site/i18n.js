import { english } from './messages.js';
import italian from './locales/it.js';
import spanish from './locales/es.js';
import french from './locales/fr.js';
export const catalogs = { en: english, it: italian, es: spanish, fr: french };
export const languages = ['de', ...Object.keys(catalogs)];
const locales = { de: 'de-DE', en: 'en-US', it: 'it-IT', es: 'es-ES', fr: 'fr-FR' };
let language = 'de';
export const getLanguage = () => language;
export const getLocale = () => locales[language];
export function setLanguage(value) {
  language = languages.includes(value) ? value : 'de';
}
export function t(key, values = {}) {
  const message = language === 'de' ? key : catalogs[language][key];
  if (message === undefined) return `[missing: ${key}]`;
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}
export function localizeDocument(document) {
  document.documentElement.lang = language;
  for (const node of document.querySelectorAll('[data-i18n]'))
    node.textContent = t(node.dataset.i18n);
  for (const attribute of ['aria-label', 'title', 'placeholder', 'label', 'content']) {
    for (const node of document.querySelectorAll(`[data-i18n-${attribute}]`))
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)));
  }
}

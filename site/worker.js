import { t, setLanguage } from './i18n.js';
import { runComparison } from './comparisons.js?v=10';
// Async parser loading must not let another request change the active locale.
let pending = Promise.resolve();
self.onmessage = ({ data }) => {
  pending = pending.then(async () => {
    setLanguage(data.options?.language || 'de');
    try {
      self.postMessage({
        id: data.id,
        ...(await runComparison(data.before, data.after, data.options))
      });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error:
          error.message ||
          t('Der Vergleich konnte nicht berechnet werden. Bitte verwende kleinere Eingaben.')
      });
    }
  });
};

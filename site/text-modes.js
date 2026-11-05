import { comparisonKey } from './comparison-key.js';
import { t, getLanguage } from './i18n.js';
import { lines, normalize, sequenceDiff, visible } from './diff.js';

const MAX_UNITS = 20000;

// Keep every normalized character, including whitespace between sentences.
export function compareSentences(before, after, options = {}) {
  if (typeof Intl.Segmenter !== 'function') {
    throw new Error(t('Der Satzvergleich benötigt einen aktuellen Browser mit Intl.Segmenter.'));
  }
  const segmenter = new Intl.Segmenter(getLanguage(), { granularity: 'sentence' });
  const segments = (text) => {
    const result = [];
    for (const { segment } of segmenter.segment(normalize(text))) {
      if (result.length >= MAX_UNITS) throw new Error(t('Maximal 20.000 Sätze pro Seite möglich.'));
      result.push(segment);
    }
    return result;
  };
  return sequenceDiff(segments(before), segments(after), (text) => comparisonKey(text, options));
}

// Compare line contents as a multiset. Ordering and the final newline are ignored;
// spaces, blank lines and repeated occurrences remain significant.
export function compareUnorderedLines(before, after, options = {}) {
  const counts = (text) => {
    const all = lines(text);
    if (all.length > MAX_UNITS) throw new Error(t('Maximal 20.000 Zeilen pro Seite möglich.'));
    const result = new Map();
    for (const raw of all) {
      const content = comparisonKey(visible(raw), options);
      result.set(content, (result.get(content) || 0) + 1);
    }
    return result;
  };
  const a = counts(before),
    b = counts(after);
  return [...new Set([...a.keys(), ...b.keys()])].sort().map((content) => {
    const old = a.get(content),
      next = b.get(content);
    return {
      path: JSON.stringify(content),
      old: old === undefined ? undefined : `${old} ×`,
      new: next === undefined ? undefined : `${next} ×`,
      type:
        old === undefined
          ? 'add'
          : next === undefined
            ? 'remove'
            : old === next
              ? 'equal'
              : 'change'
    };
  });
}

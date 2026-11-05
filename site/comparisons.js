import { t, setLanguage } from './i18n.js';
import { compare } from './diff.js';
import { compareJSON } from './modes.js';
import { compareTable, compareConfig } from './data-modes.js';
import { compareSentences, compareUnorderedLines } from './text-modes.js';
import { compareJSONLines } from './structured-modes.js';
import { compareBinary } from './binary-mode.js';

// Group replacements into readable sentence pairs, keeping every character.
function sentenceRows(ops) {
  const entries = [];
  let index = 0,
    old = 1,
    next = 1;
  while (index < ops.length) {
    if (ops[index].type === 'equal') {
      const op = ops[index++];
      entries.push({ path: `${old++} → ${next++}`, old: op.old, new: op.new, type: 'equal' });
      continue;
    }
    const removed = [],
      added = [];
    while (index < ops.length && ops[index].type !== 'equal') {
      const op = ops[index++];
      (op.type === 'remove' ? removed : added).push(op);
    }
    for (let i = 0; i < Math.max(removed.length, added.length); i++) {
      entries.push({
        path: `${removed[i] ? old++ : '—'} → ${added[i] ? next++ : '—'}`,
        old: removed[i]?.old,
        new: added[i]?.new,
        type: !removed[i] ? 'add' : !added[i] ? 'remove' : 'change'
      });
    }
  }
  return entries;
}
export function runComparison(before, after, options = {}) {
  setLanguage(options.language || 'de');
  const table = (entries, label, unit, note) => ({ entries, label, unit, note });
  switch (options.mode) {
    case 'ast':
      return import('./source-mode.js?v=10')
        .catch(() => {
          throw new Error(
            t(
              'AST: Lokale Parser konnten nicht geladen werden. Bitte Seite neu laden und WebAssembly-Unterstützung prüfen.'
            )
          );
        })
        .then(({ compareSource }) => compareSource(before, after, options));
    case 'json':
      return table(
        compareJSON(before, after),
        t('JSON-Pfad'),
        t('Knoten'),
        t('Formatierung und Objekt-Reihenfolge ignoriert.')
      );
    case 'jsonl':
      return table(
        compareJSONLines(before, after),
        t('JSONL-Pfad'),
        t('Knoten'),
        t('Datensatz-Reihenfolge bleibt relevant.')
      );
    case 'table':
      return table(
        compareTable(before, after, { delimiter: options.delimiter }),
        t('Zellposition'),
        t('Zellen'),
        t('Positionen verglichen, ohne Header- oder Schlüsselannahmen.')
      );
    case 'config':
      return table(
        compareConfig(before, after),
        t('Schlüssel'),
        t('Schlüssel'),
        t('Reihenfolge und Vollzeilenkommentare ignoriert. Werte bleiben Strings.')
      );
    case 'unordered':
      return table(
        compareUnorderedLines(before, after, options),
        t('Zeileninhalt'),
        t('verschiedene Zeilen'),
        t('Reihenfolge und letzter Zeilenumbruch ignoriert; Anzahlen bleiben relevant.')
      );
    case 'sentences': {
      const result = compareSentences(before, after, options);
      return {
        ...table(
          sentenceRows(result.ops),
          t('Satz: Original → Änderung'),
          t('Satzpaare'),
          t(
            options.whitespace
              ? 'Sätze ohne Leerraum verglichen.'
              : 'Sätze einschließlich Leerraum verglichen.'
          )
        ),
        approximate: result.approximate
      };
    }
    case 'binary':
      return table(
        compareBinary(before, after),
        t('Byte-Offset'),
        t('Blöcke'),
        t('Feste 16-Byte-Blöcke. Einfügungen verschieben nachfolgende Offsets.')
      );
    // Retain the previous mode identifier for callers outside the UI.
    case 'whitespace':
      return compare(before, after, { ...options, whitespace: true });
    default:
      return compare(before, after, options);
  }
}

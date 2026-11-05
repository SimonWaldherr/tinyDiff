import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { english } from '../site/messages.js';
import { t, setLanguage, getLocale, catalogs } from '../site/i18n.js';
import { count, formatNumber, formatBytes } from '../site/format.js';
import { runComparison } from '../site/comparisons.js';
import { compareXML } from '../site/structured-modes.js';

test('catalog covers DOM bindings and literal messages', () => {
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]*)"/g)) {
    const key = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'");
    assert(key in english, key);
  }
  const modeSelect = html.match(/<select\b[^>]*id="mode"[^>]*>([\s\S]*?)<\/select>/)[1];
  for (const option of modeSelect.matchAll(/<option\b([^>]*)>([^<]+)<\/option>/g)) {
    const key = option[1].match(/data-i18n="([^"]+)"/)?.[1] || option[2];
    assert(key in english, `Mode picker: ${key}`);
  }
  for (const name of [
    'report',
    'source-mode',
    'exif-view',
    'office',
    'zip',
    'image-view',
    'xml',
    'beautify',
    'mode-picker',
    'app',
    'modes',
    'data-modes',
    'structured-modes',
    'text-modes',
    'binary-mode',
    'comparisons',
    'worker'
  ]) {
    const source = readFileSync(new URL(`../site/${name}.js`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\bt\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g))
      assert((match[1] ?? match[2]) in english, `${name}: ${match[1] ?? match[2]}`);
  }
});
test('English plurals, numbers and interpolation leave user values untouched', () => {
  try {
    setLanguage('en');
    assert.equal(getLocale(), 'en-US');
    assert.equal(count(0, 'Änderung', 'Änderungen'), '0 changes');
    assert.equal(count(1, 'Änderung', 'Änderungen'), '1 change');
    assert.equal(count(2, 'Zeile', 'Zeilen'), '2 lines');
    assert.equal(count(1, 'Zeichen'), '1 character');
    assert.equal(count(2000, 'Knoten'), '2,000 nodes');
    assert.equal(formatNumber(1.5), '1.5');
    assert.equal(
      t('{name} geöffnet. Bereit zum Vergleichen.', { name: 'Änderung {x}.txt' }),
      'Änderung {x}.txt opened. Ready to compare.'
    );
    assert.match(t('unregistered message'), /\[missing:/);
    setLanguage('de');
    assert.equal(count(1, 'Zeile', 'Zeilen'), '1 Zeile');
    assert.equal(count(0, 'Zeile', 'Zeilen'), '0 Zeilen');
    assert.equal(count(2000, 'Zeile', 'Zeilen'), '2.000 Zeilen');
    assert.equal(formatNumber(1.5), '1,5');
    assert.match(formatBytes(1000), /1\.000.*B/);
    setLanguage('unknown');
    assert.equal(getLocale(), 'de-DE');
  } finally {
    setLanguage('de');
  }
});
test('worker modes localize errors, paths and summaries on every request', () => {
  try {
    const data = runComparison('a,b', 'a,c', { mode: 'table', language: 'en' });
    assert.equal(data.entries[0].path, 'Row 1 / Column 1');
    assert.equal(data.label, 'Cell position');
    assert.throws(
      () => runComparison('a=1\na=2', '', { mode: 'config', language: 'en' }),
      /INI\/\.env, line 2: Duplicate key a/
    );
    assert.throws(
      () => runComparison('{bad', '{}', { mode: 'json', language: 'en' }),
      /Please enter valid JSON/
    );
    assert.throws(
      () => runComparison('1\n\n', '', { mode: 'jsonl', language: 'en' }),
      /Line 2 must contain/
    );
    assert.throws(
      () => runComparison('"a', '', { mode: 'table', language: 'en' }),
      /Unclosed quote/
    );
    assert.throws(
      () =>
        runComparison(new Uint8Array(262145), new Uint8Array(), { mode: 'binary', language: 'en' }),
      /Maximum 256 KiB/
    );
    assert.throws(
      () => compareXML('<!DOCTYPE r><r/>', '<r/>'),
      /This browser does not support XML comparison/
    );
    assert.throws(
      () => runComparison('{bad', '{}', { mode: 'json', language: 'de' }),
      /gültiges JSON/
    );
  } finally {
    setLanguage('de');
  }
});

test('all language catalogs have complete keys and matching placeholders', () => {
  const fields = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [language, messages] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort(), language);
    for (const [key, value] of Object.entries(messages)) {
      assert(value.trim(), `${language}: ${key}`);
      assert.deepEqual(fields(value), fields(key), `${language}: ${key}`);
    }
  }
});
test('Italian, Spanish and French quantities and worker errors are localized', () => {
  try {
    for (const [language, singular, plural, zero] of [
      ['it', '1 riga', '2 righe', '0 righe'],
      ['es', '1 línea', '2 líneas', '0 líneas'],
      ['fr', '1 ligne', '2 lignes', '0 ligne']
    ]) {
      setLanguage(language);
      assert.equal(count(1, 'Zeile', 'Zeilen'), singular);
      assert.equal(count(2, 'Zeile', 'Zeilen'), plural);
      assert.equal(count(0, 'Zeile', 'Zeilen'), zero);
      assert(!t('Bildvorschau konnte nicht geladen werden.').includes('[missing:'));
      assert.throws(
        () => runComparison('{bad', '{}', { mode: 'json', language }),
        (error) => error.message === t('JSON: Bitte auf beiden Seiten gültiges JSON eingeben.')
      );
    }
  } finally {
    setLanguage('de');
  }
});

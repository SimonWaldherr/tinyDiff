import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesMode } from '../site/mode-picker.js';
test('mode search supports accents, case and multiple terms without interpreting markup', () => {
  assert(matchesMode('WORTER', 'Wörter'));
  assert(matchesMode('json struktur', 'JSON', 'JSON-Struktur vergleichen'));
  assert(matchesMode('  ', 'Images'));
  assert(!matchesMode('xml pixel', 'XML', 'Elemente vergleichen'));
  assert(!matchesMode('<script>', 'Wörter'));
});

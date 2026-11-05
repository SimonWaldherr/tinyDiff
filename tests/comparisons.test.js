import test from 'node:test';
import assert from 'node:assert/strict';
import { runComparison } from '../site/comparisons.js';
test('all worker table modes return labelled data and preserve missing values', () => {
  for (const [mode, before, after] of [
    ['json', '{}', '{"a":1}'],
    ['jsonl', '1', '2'],
    ['config', 'a=1', 'a=2'],
    ['table', 'a;b', 'a;c'],
    ['unordered', 'a\na\n', 'a\n']
  ]) {
    const result = runComparison(before, after, { mode });
    assert(
      result.entries.some((row) => row.type !== 'equal'),
      mode
    );
    assert(result.label && result.unit && result.note);
    assert(!result.ops);
  }
  assert.equal(runComparison('a\tb', 'a\tc', { mode: 'table', delimiter: '\t' }).entries.length, 2);
  assert.equal(
    runComparison(new Uint8Array([0]), new Uint8Array([1]), { mode: 'binary' }).entries[0].type,
    'change'
  );
});
test('sentence table alignment preserves both source texts and indexes', () => {
  for (const [before, after] of [
    ['Erster Satz. Zweiter Satz.', 'Erster Satz. Ein Ersatz. Ende.'],
    ['', 'Neu!'],
    ['Fort.', ''],
    ['Gleich.', 'Gleich.']
  ]) {
    const { entries } = runComparison(before, after, { mode: 'sentences' });
    assert.equal(entries.map((row) => row.old ?? '').join(''), before);
    assert.equal(entries.map((row) => row.new ?? '').join(''), after);
    assert(entries.every((row) => row.path.includes(' → ')));
  }
});
test('worker routes ignore options and retains the legacy whitespace alias', () => {
  const result = runComparison('a\n', 'b\n', { mode: 'words' });
  assert(result.ops.length && !result.entries);
  assert(
    runComparison('A B.', 'ab.', { mode: 'sentences', whitespace: true, case: true }).entries.every(
      (row) => row.type === 'equal'
    )
  );
  assert(
    runComparison('a b\n', 'ab\n', { mode: 'unordered', whitespace: true }).entries.every(
      (row) => row.type === 'equal'
    )
  );
  assert(
    runComparison('a b\n', 'ab\n', { mode: 'whitespace' }).ops.every((op) => op.type === 'equal')
  );
});

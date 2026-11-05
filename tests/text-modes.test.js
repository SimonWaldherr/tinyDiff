import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSentences, compareUnorderedLines } from '../site/text-modes.js';
import { normalize } from '../site/diff.js';

const reconstruct = (ops) => [
  ops
    .filter((op) => op.type !== 'add')
    .map((op) => op.old)
    .join(''),
  ops
    .filter((op) => op.type !== 'remove')
    .map((op) => op.new)
    .join('')
];

test('sentence comparison preserves complete text, Unicode and whitespace', () => {
  for (const [before, after] of [
    ['', ''],
    ['', 'Ein Satz. Noch einer!\n'],
    ['Grüße 🌍.\r\n\r\nNoch ein Satz?  Ja!\r', 'Grüße 🍀.\n\nNoch ein Satz?\nJa!\n'],
    ['Ohne Satzzeichen', 'Ohne Satzzeichen\n'],
    ['  \n\n', '\t'],
    ['Der Preis ist 1,25 €. Ende.', 'Der Preis ist 1,50 €. Ende.']
  ]) {
    const result = compareSentences(before, after);
    assert.deepEqual(reconstruct(result.ops), [normalize(before), normalize(after)]);
  }
});

test('sentence diff retains unchanged sentences and reports punctuation changes', () => {
  const { ops } = compareSentences('Hallo Welt. Guten Tag! Ende.', 'Hallo Erde. Guten Tag! Ende?');
  assert(ops.some((op) => op.type === 'equal' && op.old === 'Guten Tag! '));
  assert(ops.some((op) => op.type === 'remove' && op.old === 'Hallo Welt. '));
  assert(ops.some((op) => op.type === 'add' && op.new === 'Ende?'));
});

test('unordered lines ignore order and final newline but preserve repeated counts', () => {
  assert(compareUnorderedLines('a\nb\na\n', 'b\na\na').every((entry) => entry.type === 'equal'));
  assert.deepEqual(compareUnorderedLines('a\na\nb\n', 'a\nb\nb\nc\n'), [
    { path: '"a"', old: '2 ×', new: '1 ×', type: 'change' },
    { path: '"b"', old: '1 ×', new: '2 ×', type: 'change' },
    { path: '"c"', old: undefined, new: '1 ×', type: 'add' }
  ]);
  assert.equal(compareUnorderedLines('gone\n', '')[0].type, 'remove');
});

test('unordered lines keep empty lines, whitespace and key-like strings distinct', () => {
  assert.deepEqual(compareUnorderedLines('', ''), []);
  assert.deepEqual(compareUnorderedLines('', '\n'), [
    { path: '""', old: undefined, new: '1 ×', type: 'add' }
  ]);
  const entries = compareUnorderedLines(
    'a\r\n__proto__\rconstructor\n\n a\n',
    ' a\n\nconstructor\n__proto__\na'
  );
  assert.equal(entries.length, 5);
  assert(entries.every((entry) => entry.type === 'equal'));
  assert.equal(
    compareUnorderedLines('a\n', ' a\n').filter((entry) => entry.type !== 'equal').length,
    2
  );
  assert.equal(compareUnorderedLines('\n\n', '\n')[0].type, 'change');
});

test('sentence and unordered modes bound the number of compared units', () => {
  assert.throws(() => compareSentences('Satz. '.repeat(20001), ''), /20.000 Sätze/);
  assert.throws(() => compareUnorderedLines('\n'.repeat(20001), ''), /20.000 Zeilen/);
});
test('ignore options apply within sentences while preserving source values', () => {
  const before = 'Hello  world. Next sentence.',
    after = 'hello world. Next sentence.';
  const { ops } = compareSentences(before, after, { whitespace: true, case: true });
  assert(ops.every((op) => op.type === 'equal'));
  assert.equal(ops.map((op) => op.old).join(''), before);
  assert.equal(ops.map((op) => op.new).join(''), after);
  assert(compareSentences(before, after).ops.some((op) => op.type !== 'equal'));
});
test('unordered line ignore options merge equivalent counts without losing duplicates', () => {
  const entries = compareUnorderedLines('A B\nab\n', 'AB\na b\n', { whitespace: true, case: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, 'equal');
  assert.equal(entries[0].old, '2 ×');
  assert(
    compareUnorderedLines('a b\na b\n', 'ab\n', { whitespace: true }).some(
      (row) => row.type === 'change'
    )
  );
  assert(
    compareUnorderedLines('ab\n\n', 'ab\n', { whitespace: true }).some(
      (row) => row.type !== 'equal'
    )
  );
});

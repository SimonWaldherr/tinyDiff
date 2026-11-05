import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compare,
  lines,
  normalize,
  sequenceDiff,
  inlineParts,
  unifiedPatch
} from '../site/diff.js';

function reconstruct(ops) {
  return [
    ops
      .filter((o) => o.type !== 'add')
      .map((o) => o.old)
      .join(''),
    ops
      .filter((o) => o.type !== 'remove')
      .map((o) => o.new)
      .join('')
  ];
}
function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j], dp[i][j - 1]) + 1;
  return dp[a.length][b.length];
}
test('empty, insert, delete, repeat, Unicode, final newline and line ending cases', () => {
  for (const [a, b] of [
    ['', ''],
    ['', 'hello\n'],
    ['a\n', ''],
    ['a\nb\na\n', 'b\na\nb\n'],
    ['🍀 schön\n', '🍀 schöner\n'],
    ['a', 'a\n'],
    ['a\r\nb\r', 'a\nb\n'],
    ['\n', '\n\n'],
    ['a\n\n', 'a\n']
  ]) {
    const { ops } = compare(a, b);
    assert.deepEqual(reconstruct(ops), [normalize(a), normalize(b)]);
    assert.equal(ops.filter((o) => o.type !== 'equal').length, distance(lines(a), lines(b)));
  }
});
test('1,000 deterministic randomized edit scripts are minimal and reconstruct both inputs', () => {
  let seed = 8123;
  const rand = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let i = 0; i < 1000; i++) {
    const a = Array.from({ length: rand(18) }, () => String(rand(5)) + '\n');
    const b = Array.from({ length: rand(18) }, () => String(rand(5)) + '\n');
    const { ops } = sequenceDiff(a, b);
    assert.deepEqual(reconstruct(ops), [a.join(''), b.join('')]);
    assert.equal(ops.filter((o) => o.type !== 'equal').length, distance(a, b));
  }
});
test('ignore options preserve original values and final newline', () => {
  const result = compare(' A B \n', 'ab\n', { whitespace: true, case: true });
  assert.equal(result.ops.length, 1);
  assert.equal(result.ops[0].type, 'equal');
  assert.deepEqual(reconstruct(result.ops), [' A B \n', 'ab\n']);
  assert(compare('ab', 'ab\n', { whitespace: true }).ops.some((o) => o.type !== 'equal'));
});
test('bounded fallback preserves all text and flags coarse output', () => {
  const a = Array.from({ length: 1000 }, (_, i) => `a${i}\n`),
    b = a.map((s) => 'b' + s);
  const result = sequenceDiff(a, b, (x) => x, 20);
  assert.equal(result.approximate, true);
  assert.deepEqual(reconstruct(result.ops), [a.join(''), b.join('')]);
});
test('word highlights preserve code, emoji and malicious-looking text as data', () => {
  for (const [a, b] of [
    ['hello world', 'hello there'],
    ['<script>alert(1)</script>', '<img src=x>'],
    ['😀 ÄÖß', '🌍 ÄÖSS']
  ]) {
    assert.deepEqual(reconstruct(inlineParts(a, b)), [a, b]);
  }
});
test('patch headers, empty sides and no-final-newline marker', () => {
  assert.equal(
    unifiedPatch(compare('', 'a').ops, 'a', 'b'),
    '--- a/a\n+++ b/b\n@@ -0,0 +1,1 @@\n+a\n\\ No newline at end of file\n'
  );
  assert.match(unifiedPatch(compare('a\n', '').ops), /@@ -1,1 \+0,0 @@/);
  assert.equal(unifiedPatch(compare('a\n', 'a\n').ops), '');
  assert(!unifiedPatch(compare('a', 'b').ops, 'evil\n@@\tfile').includes('evil\n'));
});
test('character mode keeps combining sequences and emoji families intact', () => {
  const ops = inlineParts('a\u0308 👨‍👩‍👧', 'o\u0308 👩‍👩‍👧', 'characters');
  assert.deepEqual(
    ops.filter((o) => o.type === 'remove').map((o) => o.old),
    ['a\u0308', '👨‍👩‍👧']
  );
  assert.deepEqual(
    ops.filter((o) => o.type === 'add').map((o) => o.new),
    ['o\u0308', '👩‍👩‍👧']
  );
});

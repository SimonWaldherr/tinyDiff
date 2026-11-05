import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compare, unifiedPatch } from '../site/diff.js';

test('generated patches apply with git apply, including separated hunks and missing newlines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tinydiff-'));
  try {
    const fixtures = [
      ['', 'a\n'],
      ['a\n', ''],
      ['a', 'a\n'],
      ['a\n', 'a'],
      ['a\nb', 'c\nb'],
      ['a\nb\n', 'x\ny\n'],
      [
        Array.from({ length: 50 }, (_, i) => i + '\n').join(''),
        Array.from({ length: 50 }, (_, i) => (i === 2 || i === 45 ? 'changed' : i) + '\n').join('')
      ]
    ];
    for (const [a, b] of fixtures) {
      writeFileSync(join(dir, 'text.txt'), a);
      const patch = unifiedPatch(compare(a, b).ops, 'text.txt', 'text.txt');
      const run = spawnSync('git', ['apply', '--no-index', '-'], {
        cwd: dir,
        input: patch,
        encoding: 'utf8'
      });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(readFileSync(join(dir, 'text.txt'), 'utf8'), b);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('patches with spaces, quotes and Unicode filenames apply byte-exactly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tinydiff-names-'));
  try {
    for (const name of ['two words.txt', 'a"b.txt', 'schön 🍀.txt']) {
      writeFileSync(join(dir, name), 'old\n');
      const patch = unifiedPatch(compare('old\n', 'new\n').ops, name, name);
      const run = spawnSync('git', ['apply', '--no-index', '-'], {
        cwd: dir,
        input: patch,
        encoding: 'utf8'
      });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(readFileSync(join(dir, name), 'utf8'), 'new\n');
    }
    const patch = unifiedPatch(compare('a', 'b').ops, '../../secret', '/root/file');
    assert(!patch.includes('../'));
    assert(!patch.includes('+++ b//'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

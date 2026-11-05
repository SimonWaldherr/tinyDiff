import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSourceComparator } from '../site/source-mode.js';
import { sourceLanguages, sourceLanguageForFile } from '../site/source-languages.js';
import { setLanguage } from '../site/i18n.js';

const runtime = new URL('../site/vendor/tree-sitter/web-tree-sitter.wasm', import.meta.url);
const compare = createSourceComparator((name) =>
  readFile(name === 'runtime' ? runtime : sourceLanguages[name].grammar)
);
const changes = (result) => result.entries.filter((row) => row.type !== 'equal');
test('Go and Python syntax comparisons ignore trivia but preserve operators, literals and block structure', async () => {
  for (const [sourceLanguage, a, formatted, changed] of [
    [
      'python',
      'def total(x):\n    return x + 1\n',
      '# header\ndef total( x ):\n  # keep\n  return x+1 # tail\n',
      'def total(x):\n    return x * 2\n'
    ],
    [
      'go',
      'package main\nfunc total(x int) int { return x + 1 }\n',
      '// header\npackage main\n\nfunc total( x int ) int { /* keep */ return x+1 }\n',
      'package main\nfunc total(x int) int {return x * 2}\n'
    ]
  ]) {
    assert.equal(
      changes(await compare(a, formatted, { sourceLanguage })).length,
      0,
      sourceLanguage
    );
    const result = changes(await compare(a, changed, { sourceLanguage }));
    assert(result.some((row) => row.old?.includes('+') && row.new?.includes('*')));
    assert(result.some((row) => row.old?.includes('1') && row.new?.includes('2')));
  }
  assert(changes(await compare('value = "a b"\n', 'value = "ab"\n')).length > 0);
  assert(changes(await compare('if x:\n    y()\nz()\n', 'if x:\n    y()\n    z()\n')).length > 0);
  assert(
    changes(await compare('def f():\n    "doc one"\n', 'def f():\n    "doc two"\n')).length > 0
  );
});
test('syntax errors report side and location, rather than comparing recovery trees', async () => {
  setLanguage('en');
  try {
    await assert.rejects(
      compare('def broken(:\n', '', { sourceLanguage: 'python' }),
      /Original, line \d+, column \d+: Syntax error/
    );
    await assert.rejects(
      compare('package main\n', 'package main\nfunc (', { sourceLanguage: 'go' }),
      /Modified, line \d+, column \d+: Syntax error/
    );
    await assert.rejects(compare('', '', { sourceLanguage: 'ruby' }), /supported source language/);
    await assert.rejects(compare('x'.repeat(256 * 1024 + 1), ''), /Maximum 256 KiB/);
    const result = await compare('', 'x = 1\n');
    assert(changes(result).some((row) => row.type === 'add'));
  } finally {
    setLanguage('de');
  }
});
test('syntax comparison bounds tree size and depth and never executes supplied code', async () => {
  await assert.rejects(compare('x = ' + '['.repeat(202) + '0' + ']'.repeat(202), ''), /200 Ebenen/);
  await assert.rejects(compare('x = 1\n'.repeat(3000), ''), /10.000 Knoten/);
  const code = 'import os\nos.remove("must-never-run")\n';
  assert.equal(changes(await compare(code, code)).length, 0);
});

test('every shipped grammar parses its demo, ignores comments and detects operator and literal changes', async () => {
  for (const [sourceLanguage, language] of Object.entries(sourceLanguages)) {
    const before = language.example;
    const after = before.replace('price + 5', 'price * 8');
    const result = changes(await compare(before, after, { sourceLanguage }));
    assert(
      result.some((row) => row.old?.includes('5') && row.new?.includes('8')),
      sourceLanguage
    );
    assert(
      result.some((row) => row.old?.includes('+') && row.new?.includes('*')),
      sourceLanguage
    );
    await assert.rejects(compare(before + '\n@@@', before, { sourceLanguage }), /Syntaxfehler/);
    const comment = sourceLanguage === 'python' ? '# note\n' : '// note\n';
    assert.equal(
      changes(await compare(before, comment + before, { sourceLanguage })).length,
      0,
      sourceLanguage
    );
    if (sourceLanguage !== 'python')
      assert.equal(
        changes(await compare(before, '/* note */\n' + before, { sourceLanguage })).length,
        0,
        sourceLanguage
      );
    assert.equal(
      sourceLanguageForFile('TEST.' + language.extensions[0].toUpperCase()),
      sourceLanguage
    );
  }
  assert.equal(sourceLanguageForFile('types.hpp'), 'cpp');
  assert.equal(sourceLanguageForFile('header.h'), 'c');
  assert.equal(sourceLanguageForFile('module.mts'), 'typescript');
  assert.equal(sourceLanguageForFile('README.txt'), undefined);
  assert.equal(sourceLanguageForFile('go'), undefined);
});

test('small, deeply nested inputs cannot amplify syntax paths without an output bound', async () => {
  const source =
    'x = ' + '['.repeat(100) + Array(1800).fill('1').join(',') + ']'.repeat(100) + '\n';
  assert(source.length < 4096);
  await assert.rejects(compare(source, source), /Syntaxbaum-Ausgabe überschreitet 2 MiB/);
});

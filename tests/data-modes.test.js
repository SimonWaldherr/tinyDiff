import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTable, compareConfig } from '../site/data-modes.js';

const changed = (entries) => entries.filter((entry) => entry.type !== 'equal');

test('CSV compares positional cells and keeps missing cells distinct from empty values', () => {
  assert.deepEqual(compareTable('', ''), []);
  assert.deepEqual(compareTable('', ','), [
    { path: 'Zeile 1 / Spalte 1', old: undefined, new: '', type: 'add' },
    { path: 'Zeile 1 / Spalte 2', old: undefined, new: '', type: 'add' }
  ]);
  assert.deepEqual(changed(compareTable('name,value\nA,\n', 'name,value\nA\n')), [
    { path: 'Zeile 2 / Spalte 2', old: '', new: undefined, type: 'remove' }
  ]);
  assert.equal(compareTable('\n', '\n').length, 1);
  assert.equal(
    compareTable('01,true', '1,TRUE').filter((entry) => entry.type === 'change').length,
    2
  );
});

test('CSV supports quotes, escaped quotes, multiline fields, BOM and CRLF', () => {
  const result = compareTable(
    '\uFEFFname,quote\r\nA,"two\r\nlines and ""quotes"""\r\n',
    'name,quote\nA,"two\nlines and ""quotes"""\n'
  );
  assert.equal(result.length, 4);
  assert.equal(result.at(-1).old, 'two\nlines and "quotes"');
  assert.deepEqual(changed(result), []);
  assert.equal(compareTable('""', '').at(0).old, '');
  assert.equal(compareTable('"a\n"', '"a\n"').length, 1);
});

test('CSV auto-detects comma, semicolon and tab separately; explicit delimiter resolves ambiguity', () => {
  assert.deepEqual(changed(compareTable('name,value\nA,5', 'name;value\nA;5')), []);
  assert.deepEqual(changed(compareTable('name\tvalue\nA\t5', 'name;value\nA;5')), []);
  assert.deepEqual(
    compareTable('a;b,c', 'a;b,c', { delimiter: ';' }).map((entry) => entry.old),
    ['a', 'b,c']
  );
  assert.throws(() => compareTable('a', 'b', { delimiter: '|' }), /Unbekanntes/);
});

test('CSV rejects malformed quotes, excess records and cells', () => {
  for (const text of ['a,"not closed', 'a,b"c', '"a"junk,b', '"a" ,b']) {
    assert.throws(() => compareTable(text, '', { delimiter: ',' }), /CSV\/TSV/);
  }
  assert.throws(() => compareTable('"unclosed', ''), /Anführungszeichen/);
  assert.throws(() => compareTable('x\n'.repeat(10001), '', { delimiter: ',' }), /Datensätze/);
  assert.throws(() => compareTable(','.repeat(20000), '', { delimiter: ',' }), /Zellen/);
  assert.throws(() => compareTable(','.repeat(20000), ''), /Zellen/);
  assert.throws(() => compareTable('a;\"not closed', ''), /Anführungszeichen/);
});

test('INI and env compare keys across order, sections, comments and export prefixes', () => {
  const before = '# local\nexport PORT = 8080\n[server]\nhost = localhost\n; comment\n';
  const after = 'PORT=8080\n[server]\n# comment\nhost=localhost\n';
  assert.deepEqual(changed(compareConfig(before, after)), []);
  assert.deepEqual(compareConfig('a=\nb=1\n[db]\na=2', 'a=\nc=1\n[db]\na=3'), [
    { path: 'a', old: '', new: '', type: 'equal' },
    { path: 'b', old: '1', new: undefined, type: 'remove' },
    { path: 'c', old: undefined, new: '1', type: 'add' },
    { path: '[db] a', old: '2', new: '3', type: 'change' }
  ]);
});

test('config values preserve quotes, comment markers, equals signs and interpolation text', () => {
  const text =
    'url = https://example.test/#anchor;value=a\nquote="literal"\nref=${HOME}\n__proto__=safe\nconstructor=ok';
  const result = compareConfig(text, text);
  assert.equal(
    result.find((entry) => entry.path === 'url').old,
    'https://example.test/#anchor;value=a'
  );
  assert.equal(result.find((entry) => entry.path === 'quote').old, '"literal"');
  assert.equal(result.find((entry) => entry.path === 'ref').old, '${HOME}');
  assert.deepEqual(changed(result), []);
  const collision = compareConfig('[a/b]\nc=one\n[a]\nb/c=two', '[a/b]\nc=two\n[a]\nb/c=one');
  assert.equal(collision.length, 2);
  assert(collision.every((entry) => entry.type === 'change'));
});

test('config rejects duplicates and unsupported or malformed syntax without hiding differences', () => {
  for (const text of [
    'a=1\na=2',
    '[db]\na=1\n[db]\na=2',
    '[bad',
    '[]',
    '[a] #comment',
    'key:value',
    '=value',
    'two words=value',
    'key=\"unclosed',
    "key='unclosed"
  ]) {
    assert.throws(() => compareConfig(text, ''), /INI\/\.env, Zeile/);
  }
  assert.deepEqual(compareConfig('# comment\n; other\n', ''), []);
});

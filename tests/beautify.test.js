import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJSON, detectFormat } from '../site/beautify.js';
test('JSON formatting preserves duplicate keys, number spelling and literal contents', () => {
  const source = '{ "n":9007199254740993,"n":1e+30,"text":" a > b ","array":[{},[],true,null]}';
  const compact = '{"n":9007199254740993,"n":1e+30,"text":" a > b ","array":[{},[],true,null]}';
  assert.equal(formatJSON(source, true), compact);
  assert.equal(formatJSON(formatJSON(source), true), compact);
  assert.equal(formatJSON(formatJSON(source)), formatJSON(source));
  assert.match(formatJSON(source), /\n  "n": 9007199254740993/);
  assert.equal(formatJSON('"a \\" b"', true), '"a \\" b"');
  assert.throws(() => formatJSON('{bad'), /gültiges JSON/);
  assert.throws(() => formatJSON('['.repeat(201) + '0' + ']'.repeat(201)), /verschachtelt/);
});

test('format tools require supported structured input, including valid JSON scalars', () => {
  for (const value of ['', '   ', 'Ordinary text', '{unfinished', '[1,]', '<not xml', 'one\ntwo'])
    assert.equal(detectFormat(value), null, value);
  for (const value of ['{}', ' [1,2] ', 'null', 'true', '42', '"text"'])
    assert.equal(detectFormat(value), 'json', value);
});

test('JSON minification enforces the same nesting limit as beautification', () => {
  const source = '['.repeat(201) + '0' + ']'.repeat(201);
  assert.throws(() => formatJSON(source, true), /verschachtelt/);
});

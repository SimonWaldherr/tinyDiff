import test from 'node:test';
import assert from 'node:assert/strict';
import { compareJSONLines, xmlTree } from '../site/structured-modes.js';
test('JSON Lines compares each record structurally while keeping record order', () => {
  const a = '{"a":1,"b":true}\r\n{"v":"x"}\r\n';
  const b = '{ "b": true, "a": 1 }\n{"v":"y"}';
  const changes = compareJSONLines(a, b).filter((row) => row.type !== 'equal');
  assert.deepEqual(changes, [{ path: 'Zeile 2/v', old: '"x"', new: '"y"', type: 'change' }]);
  assert(compareJSONLines('1\n2', '2\n1').every((row) => row.type === 'change'));
  assert.deepEqual(compareJSONLines('', ''), []);
  assert.equal(compareJSONLines('', 'null\n')[0].type, 'add');
  assert.throws(() => compareJSONLines('1\n\n2', ''), /Zeile 2/);
  assert.throws(() => compareJSONLines('{bad', ''), /Zeile 1/);
});
test('XML reports unsupported runtimes and forbids document type declarations', () => {
  assert.throws(() => xmlTree('<r/>', null), /Browser/);
  class Parser {
    parseFromString() {
      throw new Error('should not parse');
    }
  }
  assert.throws(() => xmlTree('<!DOCTYPE r SYSTEM "a"><r/>', Parser), /DOCTYPE/);
});
test('XML recognizes both browser parser-error namespaces', () => {
  for (const namespace of [
    'http://www.mozilla.org/newlayout/xml/parsererror.xml',
    'http://www.w3.org/1999/xhtml'
  ]) {
    class Parser {
      parseFromString() {
        return {
          documentElement: {},
          getElementsByTagNameNS: (ns, name) =>
            ns === namespace && name === 'parsererror' ? [{}] : []
        };
      }
    }
    assert.throws(() => xmlTree('<broken>', Parser), /gültiges XML/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { compareJSON, jsonTree, directoryEntries, equalBytes, pixelDiff } from '../site/modes.js';
test('JSON ignores formatting and object order but preserves types, arrays and escaped paths', () => {
  assert(compareJSON('{"a":1,"b":true}', '{ "b": true, "a": 1 }').every((o) => o.type === 'equal'));
  const changes = compareJSON(
    '{"a/b":{"~":1},"arr":[1,2],"gone":null}',
    '{"a/b":{"~":"1"},"arr":[2,1],"new":false}'
  );
  assert.equal(changes.find((o) => o.path === '/a~1b/~0').type, 'change');
  assert.equal(changes.find((o) => o.path === '/arr/0').type, 'change');
  assert.equal(changes.find((o) => o.path === '/gone').type, 'remove');
  assert.equal(changes.find((o) => o.path === '/new').type, 'add');
  assert.equal(compareJSON('{}', '[]')[0].type, 'change');
  assert.throws(() => jsonTree('{bad'), /gültiges JSON/);
  assert.throws(() => jsonTree('['.repeat(202) + '0' + ']'.repeat(202)), /verschachtelt/);
});
test('directories retain nested paths, remove root names and reject collisions', () => {
  const files = [
    { name: 'x', webkitRelativePath: 'root/a/x' },
    { name: 'x', webkitRelativePath: 'root/b/x' },
    { name: '.hidden', webkitRelativePath: 'root/.hidden' }
  ];
  assert.deepEqual([...directoryEntries(files).keys()], ['a/x', 'b/x', '.hidden']);
  assert.throws(() => directoryEntries([files[0], files[0]]), /Doppelter/);
  assert(equalBytes(new Uint8Array([0, 255]).buffer, new Uint8Array([0, 255]).buffer));
  assert(!equalBytes(new Uint8Array([0, 1]).buffer, new Uint8Array([0, 2]).buffer));
  assert(!equalBytes(new Uint8Array([0]).buffer, new Uint8Array([0, 0]).buffer));
});
test('pixel comparison catches alpha, color and dimensions without scaling', () => {
  const a = { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) };
  assert.equal(pixelDiff(a, a, 1, 1).changed, 0);
  assert.equal(pixelDiff(a, { ...a, data: new Uint8ClampedArray([1, 2, 3, 0]) }, 1, 1).changed, 1);
  const b = { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255, 0, 0, 0, 0]) };
  const result = pixelDiff(a, b, 2, 1);
  assert.equal(result.changed, 1);
  assert.deepEqual([...result.data.slice(4)], [230, 55, 115, 255]);
});
test('different aspect ratios do not count empty corners as changed pixels', () => {
  const a = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  const b = { width: 1, height: 2, data: new Uint8ClampedArray(8) };
  const result = pixelDiff(a, b, 2, 2);
  assert.equal(result.changed, 2);
  assert.deepEqual([...result.data.slice(12)], [0, 0, 0, 0]);
});
test('pixel tolerance is inclusive and alpha can be excluded independently', () => {
  const a = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
  const b = { ...a, data: new Uint8ClampedArray([15, 20, 30, 240]) };
  assert.equal(pixelDiff(a, b, 1, 1, { tolerance: 15 }).changed, 0);
  assert.equal(pixelDiff(a, b, 1, 1, { tolerance: 14 }).changed, 1);
  assert.equal(pixelDiff(a, b, 1, 1, { tolerance: 5, ignoreAlpha: true }).changed, 0);
  assert.equal(pixelDiff(a, b, 1, 1, { tolerance: 4, ignoreAlpha: true }).changed, 1);
  const larger = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  assert.equal(pixelDiff(a, larger, 2, 1, { tolerance: 255, ignoreAlpha: true }).changed, 1);
});

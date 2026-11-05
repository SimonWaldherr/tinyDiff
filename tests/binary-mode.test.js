import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBinary, MAX_BINARY_BYTES } from '../site/binary-mode.js';

function reconstruct(entries, side) {
  return Uint8Array.from(
    entries.flatMap((entry) =>
      entry[side] === undefined
        ? []
        : entry[side]
            .slice(0, 47)
            .trim()
            .split(' ')
            .map((hex) => parseInt(hex, 16))
    )
  );
}

test('binary comparison handles empty inputs, NULs and partial hex/ASCII blocks', () => {
  assert.deepEqual(compareBinary(new ArrayBuffer(0), new Uint8Array()), []);
  const original = new Uint8Array([0, 0x1f, 0x20, 0x41, 0x7e, 0x7f, 0xff]);
  const entries = compareBinary(original.buffer, original);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, '0x00000000');
  assert.equal(entries[0].type, 'equal');
  assert.equal(entries[0].old.slice(0, 20), '00 1f 20 41 7e 7f ff');
  assert.match(entries[0].old, /\|\.\. A~\.\.\|$/);
  assert.deepEqual(reconstruct(entries, 'old'), original);
});

test('binary comparison distinguishes additions, removals and changes at fixed offsets', () => {
  const before = Uint8Array.from({ length: 19 }, (_, i) => i);
  const after = Uint8Array.from({ length: 35 }, (_, i) => i);
  after[16] = 255;
  const entries = compareBinary(before, after);
  assert.deepEqual(
    entries.map((entry) => [entry.path, entry.type]),
    [
      ['0x00000000', 'equal'],
      ['0x00000010', 'change'],
      ['0x00000020', 'add']
    ]
  );
  assert.equal(entries[2].old, undefined);
  assert.deepEqual(reconstruct(entries, 'old'), before);
  assert.deepEqual(reconstruct(entries, 'new'), after);
  const reversed = compareBinary(after, before);
  assert.equal(reversed[2].type, 'remove');
  assert.equal(reversed[2].new, undefined);
  assert.deepEqual(compareBinary(new Uint8Array(), new Uint8Array([0]))[0].type, 'add');
});

test('binary Uint8Array views respect byteOffset and do not compare backing bytes', () => {
  const left = new Uint8Array([99, 65, 66, 98]);
  const right = new Uint8Array([77, 65, 66, 76]);
  const entries = compareBinary(left.subarray(1, 3), right.subarray(1, 3));
  assert.equal(entries[0].type, 'equal');
  assert.deepEqual(reconstruct(entries, 'old'), new Uint8Array([65, 66]));
  assert.deepEqual(left, new Uint8Array([99, 65, 66, 98]));
});

test('byte insertion shifts following blocks instead of realigning them', () => {
  const before = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const after = new Uint8Array([0, ...before]);
  const entries = compareBinary(before, after);
  assert.deepEqual(
    entries.map((entry) => entry.type),
    ['change', 'change', 'add']
  );
  assert.deepEqual(reconstruct(entries, 'old'), before);
  assert.deepEqual(reconstruct(entries, 'new'), after);
});

test('binary comparison enforces a per-side byte limit and rejects unsupported input', () => {
  assert.equal(
    compareBinary(new Uint8Array(MAX_BINARY_BYTES), new Uint8Array()).length,
    MAX_BINARY_BYTES / 16
  );
  for (const [a, b] of [
    [new Uint8Array(MAX_BINARY_BYTES + 1), new Uint8Array()],
    [new Uint8Array(), new Uint8Array(MAX_BINARY_BYTES + 1)]
  ]) {
    assert.throws(() => compareBinary(a, b), /256 KiB/);
  }
  assert.throws(() => compareBinary('text', new Uint8Array()), /ArrayBuffer oder Uint8Array/);
});

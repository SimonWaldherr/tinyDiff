import { t } from './i18n.js';
// Fixed-offset byte comparison. Insertions shift subsequent blocks; blocks are not realigned.
export const MAX_BINARY_BYTES = 256 * 1024;
const BLOCK_BYTES = 16;

function bytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError(t('Binärvergleich: Bitte ArrayBuffer oder Uint8Array übergeben.'));
}

function display(block) {
  const hex = Array.from(block, (value) => value.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(block, (value) =>
    value >= 32 && value <= 126 ? String.fromCharCode(value) : '.'
  ).join('');
  return `${hex.padEnd(BLOCK_BYTES * 3 - 1, ' ')}  |${ascii}|`;
}

export function compareBinary(beforeBuffer, afterBuffer) {
  const before = bytes(beforeBuffer),
    after = bytes(afterBuffer);
  if (before.byteLength > MAX_BINARY_BYTES || after.byteLength > MAX_BINARY_BYTES) {
    throw new Error(t('Binärvergleich: Maximal 256 KiB pro Seite.'));
  }
  const entries = [];
  for (let offset = 0; offset < Math.max(before.length, after.length); offset += BLOCK_BYTES) {
    const old = offset < before.length ? before.subarray(offset, offset + BLOCK_BYTES) : undefined;
    const next = offset < after.length ? after.subarray(offset, offset + BLOCK_BYTES) : undefined;
    const equal =
      old &&
      next &&
      old.length === next.length &&
      old.every((value, index) => value === next[index]);
    entries.push({
      path: '0x' + offset.toString(16).padStart(8, '0'),
      old: old === undefined ? undefined : display(old),
      new: next === undefined ? undefined : display(next),
      type: old === undefined ? 'add' : next === undefined ? 'remove' : equal ? 'equal' : 'change'
    });
  }
  return entries;
}

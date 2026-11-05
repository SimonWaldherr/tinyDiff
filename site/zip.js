import { t } from './i18n.js';
import { crc32 } from './checksum.js';
export { crc32 } from './checksum.js';
export const MAX_OFFICE_BYTES = 20 * 1024 * 1024;
const MAX_PART_BYTES = 8 * 1024 * 1024;
const invalid = () => new Error(t('Office: Ungültiges oder nicht unterstütztes ZIP-Paket.'));
export function openOfficeZip(buffer) {
  const bytes = new Uint8Array(buffer),
    data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > MAX_OFFICE_BYTES) throw new Error(t('Office: Maximal 20 MiB pro Datei.'));
  const range = (offset, size) => {
    if (offset < 0 || size < 0 || offset + size > bytes.length) throw invalid();
  };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      data.getUint32(i, true) === 0x06054b50 &&
      i + 22 + data.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) throw invalid();
  const entries = data.getUint16(end + 10, true),
    size = data.getUint32(end + 12, true),
    start = data.getUint32(end + 16, true);
  if (
    data.getUint16(end + 4, true) ||
    data.getUint16(end + 6, true) ||
    data.getUint16(end + 8, true) !== entries ||
    entries > 5000 ||
    start + size > end
  )
    throw invalid();
  range(start, size);
  const files = new Map();
  let offset = start;
  for (let n = 0; n < entries; n++) {
    range(offset, 46);
    if (data.getUint32(offset, true) !== 0x02014b50) throw invalid();
    if (data.getUint16(offset + 34, true) !== 0) throw invalid();
    const length = data.getUint16(offset + 28, true),
      extra = data.getUint16(offset + 30, true),
      comment = data.getUint16(offset + 32, true);
    range(offset + 46, length + extra + comment);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length));
    if (files.has(name)) throw invalid();
    files.set(name, {
      flags: data.getUint16(offset + 8, true),
      method: data.getUint16(offset + 10, true),
      crc: data.getUint32(offset + 16, true),
      compressed: data.getUint32(offset + 20, true),
      size: data.getUint32(offset + 24, true),
      local: data.getUint32(offset + 42, true)
    });
    offset += 46 + length + extra + comment;
    if (offset > start + size) throw invalid();
  }
  if (offset !== start + size) throw invalid();
  let extracted = 0;
  return {
    has: (name) => files.has(name),
    async read(name, isCurrent = () => true) {
      const entry = files.get(name);
      if (!entry)
        throw new Error(t('Office: Erforderlicher XML-Bestandteil fehlt: {name}', { name }));
      if (entry.flags & 1 || ![0, 8].includes(entry.method)) throw invalid();
      if (entry.method === 0 && entry.compressed !== entry.size) throw invalid();
      if (entry.size > MAX_PART_BYTES || extracted + entry.size > 32 * 1024 * 1024)
        throw new Error(t('Office: Entpackte XML-Daten überschreiten das Größenlimit.'));
      range(entry.local, 30);
      if (
        data.getUint32(entry.local, true) !== 0x04034b50 ||
        data.getUint16(entry.local + 8, true) !== entry.method ||
        data.getUint16(entry.local + 6, true) !== entry.flags
      )
        throw invalid();
      const nameLength = data.getUint16(entry.local + 26, true),
        extraLength = data.getUint16(entry.local + 28, true);
      range(entry.local + 30, nameLength + extraLength);
      if (
        new TextDecoder().decode(
          bytes.subarray(entry.local + 30, entry.local + 30 + nameLength)
        ) !== name
      )
        throw invalid();
      const begin = entry.local + 30 + nameLength + extraLength;
      range(begin, entry.compressed);
      if (begin + entry.compressed > start) throw invalid();
      let output;
      if (entry.method === 0) output = bytes.slice(begin, begin + entry.compressed);
      else {
        let decompressor;
        try {
          decompressor = new DecompressionStream('deflate-raw');
        } catch {
          throw new Error(
            t(
              'Office: Dieser Browser unterstützt das Entpacken nicht. Bitte einen aktuellen Browser verwenden.'
            )
          );
        }
        const reader = new Blob([bytes.subarray(begin, begin + entry.compressed)])
          .stream()
          .pipeThrough(decompressor)
          .getReader();
        const chunks = [];
        let length = 0;
        try {
          while (true) {
            if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > entry.size || length > MAX_PART_BYTES) throw invalid();
            chunks.push(value);
          }
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        } finally {
          reader.releaseLock();
        }
        output = new Uint8Array(length);
        let cursor = 0;
        for (const chunk of chunks) {
          output.set(chunk, cursor);
          cursor += chunk.length;
        }
      }
      if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
      if (output.length !== entry.size || crc32(output) !== entry.crc) throw invalid();
      extracted += output.length;
      return output;
    }
  };
}

import { crc32 } from './checksum.js';
// Bounded TIFF/EXIF reader. No thumbnail decoding or vendor-specific interpretation.
const names = {
  0x010e: 'ImageDescription',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0112: 'Orientation',
  0x011a: 'XResolution',
  0x011b: 'YResolution',
  0x0128: 'ResolutionUnit',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x829a: 'ExposureTime',
  0x829d: 'FNumber',
  0x8827: 'PhotographicSensitivity',
  0x9000: 'ExifVersion',
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
  0x9011: 'OffsetTimeOriginal',
  0x9201: 'ShutterSpeedValue',
  0x9202: 'ApertureValue',
  0x9209: 'Flash',
  0x920a: 'FocalLength',
  0x927c: 'MakerNote',
  0x9286: 'UserComment',
  0xa001: 'ColorSpace',
  0xa002: 'PixelXDimension',
  0xa003: 'PixelYDimension',
  0xa405: 'FocalLengthIn35mmFilm',
  0xa431: 'BodySerialNumber',
  0xa434: 'LensModel'
};
const gpsNames = [
  'GPSVersionID',
  'GPSLatitudeRef',
  'GPSLatitude',
  'GPSLongitudeRef',
  'GPSLongitude',
  'GPSAltitudeRef',
  'GPSAltitude',
  'GPSTimeStamp'
];
const invalid = () => new Error('exif-invalid');
export function readExifTIFF(bytes) {
  if (bytes.length > 1024 * 1024) throw invalid();
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const range = (offset, length) => {
    if (offset < 0 || length < 0 || offset + length > bytes.length) throw invalid();
  };
  range(0, 8);
  const order = data.getUint16(0);
  if (![0x4949, 0x4d4d].includes(order)) throw invalid();
  const little = order === 0x4949;
  const u16 = (offset) => data.getUint16(offset, little);
  const u32 = (offset) => data.getUint32(offset, little);
  if (u16(2) !== 42) throw invalid();
  const tags = new Map(),
    visited = new Set();
  let total = 0,
    valueBytes = 0;
  function directory(offset, path) {
    if (!offset || visited.has(offset) || visited.size >= 4) throw invalid();
    visited.add(offset);
    range(offset, 2);
    const count = u16(offset);
    if ((total += count) > 512) throw invalid();
    range(offset + 2, count * 12 + 4);
    const ids = new Set();
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      const id = u16(entry),
        type = u16(entry + 2),
        count = u32(entry + 4);
      if (ids.has(id)) throw invalid();
      ids.add(id);
      const size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type];
      if (!size || count * size > 65536) throw invalid();
      const length = count * size,
        start = length <= 4 ? entry + 8 : u32(entry + 8);
      range(start, length);
      // Reused offsets must not multiply the amount of decoded/displayed data.
      if ((valueBytes += length) > 1024 * 1024) throw invalid();
      const pointer = { 0x8769: 'Exif', 0x8825: 'GPS', 0xa005: 'Interop' }[id];
      if (pointer) {
        const parent = pointer === 'Interop' ? 'Exif' : 'IFD0';
        if (path !== parent || type !== 4 || count !== 1) throw invalid();
        directory(u32(start), pointer);
        continue;
      }
      let value;
      if (type === 2) {
        const raw = bytes.subarray(start, start + length);
        try {
          value = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/\0+$/, '');
        } catch {
          value = { hex: Array.from(raw, (n) => n.toString(16).padStart(2, '0')).join('') };
        }
      } else if (type === 7)
        value = Array.from(bytes.subarray(start, start + length), (n) =>
          n.toString(16).padStart(2, '0')
        ).join('');
      else {
        value = [];
        for (let n = 0; n < count; n++) {
          const p = start + n * size;
          const method = {
            1: 'getUint8',
            3: 'getUint16',
            4: 'getUint32',
            6: 'getInt8',
            8: 'getInt16',
            9: 'getInt32',
            11: 'getFloat32',
            12: 'getFloat64'
          }[type];
          if (type === 5 || type === 10) {
            const read = type === 5 ? 'getUint32' : 'getInt32';
            value.push(`${data[read](p, little)}/${data[read](p + 4, little)}`);
          } else {
            const number = data[method](p, little);
            value.push(Number.isFinite(number) ? number : String(number));
          }
        }
      }
      const name = path === 'GPS' ? (id === 0x1d ? 'GPSDateStamp' : gpsNames[id]) : names[id];
      const key = `${path}/${name || '0x' + id.toString(16).padStart(4, '0')}`;
      tags.set(key, { type, value });
    }
  }
  directory(u32(4), 'IFD0');
  return tags;
}

export function readImageExif(buffer) {
  const bytes = new Uint8Array(buffer);
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start, size) => String.fromCharCode(...bytes.subarray(start, start + size));
  const blocks = [];
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let p = 2;
      while (p < bytes.length) {
        if (bytes[p++] !== 0xff) throw invalid();
        while (bytes[p] === 0xff) p++;
        const marker = bytes[p++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (p + 2 > bytes.length) throw invalid();
        const length = data.getUint16(p);
        if (length < 2 || p + length > bytes.length) throw invalid();
        if (marker === 0xe1 && ascii(p + 2, 6) === 'Exif\0\0')
          blocks.push(bytes.subarray(p + 8, p + length));
        p += length;
      }
    } else if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') {
      let p = 8;
      while (p < bytes.length) {
        if (p + 12 > bytes.length) throw invalid();
        const length = data.getUint32(p),
          type = ascii(p + 4, 4);
        if (p + 12 + length > bytes.length) throw invalid();
        if (type === 'eXIf') {
          if (crc32(bytes.subarray(p + 4, p + 8 + length)) !== data.getUint32(p + 8 + length))
            throw invalid();
          blocks.push(bytes.subarray(p + 8, p + 8 + length));
        }
        p += 12 + length;
        if (type === 'IEND') break;
      }
    } else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      const end = data.getUint32(4, true) + 8;
      if (end !== bytes.length) throw invalid();
      let p = 12;
      while (p < end) {
        if (p + 8 > end) throw invalid();
        const length = data.getUint32(p + 4, true);
        if (p + 8 + length + (length % 2) > end) throw invalid();
        if (ascii(p, 4) === 'EXIF') blocks.push(bytes.subarray(p + 8, p + 8 + length));
        p += 8 + length + (length % 2);
      }
    } else return { status: 'unsupported', tags: new Map() };
    if (!blocks.length) return { status: 'absent', tags: new Map() };
    if (blocks.length !== 1) throw invalid();
    let block = blocks[0];
    if (String.fromCharCode(...block.subarray(0, 6)) === 'Exif\0\0') block = block.subarray(6);
    return { status: 'ok', tags: readExifTIFF(block) };
  } catch {
    return { status: 'error', tags: new Map() };
  }
}

export function compareExif(a, b) {
  return [...new Set([...a.keys(), ...b.keys()])].sort().map((path) => {
    const before = a.get(path),
      after = b.get(path);
    return {
      path,
      before,
      after,
      type: !before
        ? 'add'
        : !after
          ? 'remove'
          : JSON.stringify(before) === JSON.stringify(after)
            ? 'equal'
            : 'change'
    };
  });
}

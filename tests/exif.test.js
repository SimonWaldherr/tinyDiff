import test from 'node:test';
import assert from 'node:assert/strict';
import { readExifTIFF, readImageExif, compareExif } from '../site/exif.js';
import { demoExif, addDemoExif } from '../site/image-demo-exif.js';

function jpeg(tiff) {
  const bytes = new Uint8Array(tiff.length + 14);
  bytes.set([
    255,
    216,
    255,
    225,
    (tiff.length + 8) >> 8,
    (tiff.length + 8) & 255,
    69,
    120,
    105,
    102,
    0,
    0
  ]);
  bytes.set(tiff, 12);
  bytes.set([255, 217], bytes.length - 2);
  return bytes;
}
function webp(tiff) {
  const bytes = new Uint8Array(20 + tiff.length + (tiff.length % 2)),
    data = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'));
  bytes.set(new TextEncoder().encode('WEBPEXIF'), 8);
  data.setUint32(4, bytes.length - 8, true);
  data.setUint32(16, tiff.length, true);
  bytes.set(tiff, 20);
  return bytes;
}
test('demo EXIF contains stable public Eibsee GPS and consistent local/UTC times', () => {
  const a = readExifTIFF(demoExif(false)),
    b = readExifTIFF(demoExif(true));
  assert.equal(a.get('Exif/DateTimeOriginal').value, '2026:06:21 06:40:00');
  assert.equal(b.get('Exif/DateTimeOriginal').value, '2026:06:21 07:05:00');
  assert.equal(a.get('Exif/OffsetTimeOriginal').value, '+02:00');
  assert.deepEqual(a.get('GPS/GPSTimeStamp').value, ['4/1', '40/1', '0/1']);
  assert.deepEqual(b.get('GPS/GPSTimeStamp').value, ['5/1', '5/1', '0/1']);
  assert.deepEqual(a.get('GPS/GPSLatitude').value, ['47/1', '27/1', '22446/1000']);
  assert.deepEqual(a.get('GPS/GPSLongitude').value, ['10/1', '59/1', '15702/1000']);
  assert.deepEqual(
    compareExif(a, b)
      .filter((row) => row.type !== 'equal')
      .map((row) => row.path),
    ['Exif/DateTimeOriginal', 'GPS/GPSTimeStamp', 'IFD0/DateTime']
  );
  assert.equal(compareExif(a, new Map()).filter((row) => row.type === 'remove').length, a.size);
});
test('EXIF is located in JPEG APP1, PNG eXIf and WebP EXIF containers', async () => {
  const tiff = demoExif(false),
    expected = readExifTIFF(tiff);
  const emptyPNG = new Uint8Array(45);
  emptyPNG.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(emptyPNG.buffer).setUint32(8, 13);
  emptyPNG.set(new TextEncoder().encode('IHDR'), 12);
  emptyPNG.set(new TextEncoder().encode('IEND'), 37);
  const png = new Uint8Array(await (await addDemoExif(new Blob([emptyPNG]), false)).arrayBuffer());
  for (const bytes of [jpeg(tiff), webp(tiff), png]) {
    const result = readImageExif(bytes);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.tags, expected);
  }
  png[45] ^= 1;
  assert.equal(readImageExif(png).status, 'error');
  assert.equal(readImageExif(new Uint8Array([255, 216, 255, 217])).status, 'absent');
  assert.equal(readImageExif(new TextEncoder().encode('GIF89a')).status, 'unsupported');
});
test('TIFF handles big-endian inline values and rejects invalid offsets, cycles and counts', () => {
  const bytes = new Uint8Array(26),
    data = new DataView(bytes.buffer);
  bytes.set([77, 77, 0, 42, 0, 0, 0, 8, 0, 1]);
  data.setUint16(10, 0x0112);
  data.setUint16(12, 3);
  data.setUint32(14, 1);
  data.setUint16(18, 6);
  assert.deepEqual(readExifTIFF(bytes).get('IFD0/Orientation').value, [6]);
  data.setUint32(14, 0xffffffff);
  assert.throws(() => readExifTIFF(bytes), /exif-invalid/);
  const cyclic = demoExif(false),
    view = new DataView(cyclic.buffer);
  const pointer = 8 + 2 + 6 * 12;
  view.setUint32(pointer + 8, 8, true);
  assert.throws(() => readExifTIFF(cyclic), /exif-invalid/);
  const truncated = jpeg(demoExif(false));
  for (let i = 4; i < truncated.length - 2; i++)
    assert.equal(readImageExif(truncated.subarray(0, i)).status, 'error');
  assert.throws(() => readExifTIFF(new Uint8Array(1024 * 1024 + 1)), /exif-invalid/);
});

test('reused TIFF payload offsets cannot multiply the metadata output budget', () => {
  const count = 17,
    payload = 8 + 2 + count * 12 + 4;
  const bytes = new Uint8Array(payload + 65536),
    data = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0, 8, 0, 0, 0]);
  data.setUint16(8, count, true);
  for (let i = 0; i < count; i++) {
    const p = 10 + i * 12;
    data.setUint16(p, 0x100 + i, true);
    data.setUint16(p + 2, 7, true);
    data.setUint32(p + 4, 65536, true);
    data.setUint32(p + 8, payload, true);
  }
  assert.throws(() => readExifTIFF(bytes), /exif-invalid/);
});

test('EXIF directory pointers cannot overwrite another directory with the same path', () => {
  const bytes = new Uint8Array(50),
    data = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0, 8, 0, 0, 0]);
  for (const [offset, target] of [
    [8, 26],
    [26, 44]
  ]) {
    data.setUint16(offset, 1, true);
    data.setUint16(offset + 2, 0x8769, true);
    data.setUint16(offset + 4, 4, true);
    data.setUint32(offset + 6, 1, true);
    data.setUint32(offset + 10, target, true);
  }
  assert.throws(() => readExifTIFF(bytes), /exif-invalid/);
});

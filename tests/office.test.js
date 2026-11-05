import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { crc32, openOfficeZip } from '../site/zip.js';
import { resolvePart, decodeOfficeXML } from '../site/office.js';
import { makeZip, docxParts } from './office-fixtures.js';

test('ZIP reader handles stored and raw-deflated Office XML and checks CRC', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  for (const compress of [undefined, deflateRawSync]) {
    const bytes = makeZip(docxParts, compress);
    assert.equal(
      decodeOfficeXML(await openOfficeZip(bytes).read('word/document.xml')),
      docxParts['word/document.xml']
    );
  }
  const corrupt = makeZip({ 'word/document.xml': 'hello' });
  corrupt[30 + 'word/document.xml'.length] ^= 1;
  await assert.rejects(openOfficeZip(corrupt).read('word/document.xml'), /ZIP/);
});
test('ZIP reader rejects truncation, encrypted entries, oversized output and stale reads', async () => {
  const bytes = makeZip({ 'word/document.xml': 'x'.repeat(1000) }, deflateRawSync);
  assert.throws(() => openOfficeZip(bytes.slice(0, -1)), /ZIP/);
  assert.throws(() => openOfficeZip(new Uint8Array()), /ZIP/);
  await assert.rejects(openOfficeZip(bytes).read('missing'), /fehlt/);
  await assert.rejects(
    openOfficeZip(bytes).read('word/document.xml', () => false),
    /Cancelled/
  );
  const end = bytes.length - 22,
    start = new DataView(bytes.buffer).getUint32(end + 16, true);
  const encrypted = bytes.slice();
  new DataView(encrypted.buffer).setUint16(start + 8, 1, true);
  await assert.rejects(openOfficeZip(encrypted).read('word/document.xml'), /ZIP/);
  const huge = bytes.slice();
  new DataView(huge.buffer).setUint32(start + 24, 8 * 1024 * 1024 + 1, true);
  await assert.rejects(openOfficeZip(huge).read('word/document.xml'), /Größenlimit/);
  const lies = bytes.slice();
  new DataView(lies.buffer).setUint32(start + 24, 2, true);
  await assert.rejects(openOfficeZip(lies).read('word/document.xml'), /ZIP/);
});
test('package relationships stay internal and UTF-16 XML is supported', () => {
  assert.equal(resolvePart('ppt/presentation.xml', 'slides/slide2.xml'), 'ppt/slides/slide2.xml');
  assert.equal(
    resolvePart('xl/workbook.xml', '/xl/worksheets/sheet1.xml'),
    'xl/worksheets/sheet1.xml'
  );
  assert.throws(() => resolvePart('xl/workbook.xml', '../../escape'), /Paketverknüpfung/);
  assert.throws(() => resolvePart('xl/workbook.xml', 'https://example.com/a'), /Paketverknüpfung/);
  assert.throws(() => resolvePart('xl/workbook.xml', '..\\escape'), /Paketverknüpfung/);
  for (const bytes of [
    [255, 254, 60, 0, 114, 0, 47, 0, 62, 0],
    [254, 255, 0, 60, 0, 114, 0, 47, 0, 62],
    [60, 0, 114, 0, 47, 0, 62, 0],
    [0, 60, 0, 114, 0, 47, 0, 62]
  ])
    assert.equal(decodeOfficeXML(new Uint8Array(bytes)), '<r/>');
  assert.throws(() => decodeOfficeXML(new Uint8Array([0xff])), /Zeichenkodierung/);
});

test('stored ZIP entries reject conflicting lengths before copying the payload', async () => {
  const bytes = makeZip({ 'word/document.xml': 'hello' });
  const data = new DataView(bytes.buffer);
  const start = data.getUint32(bytes.length - 22 + 16, true);
  data.setUint32(start + 24, 1, true);
  await assert.rejects(openOfficeZip(bytes).read('word/document.xml'), /ZIP/);
});

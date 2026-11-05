import { crc32 } from '../site/zip.js';
export const wordNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const relNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const docxParts = {
  'word/document.xml': `<w:document xmlns:w="${wordNS}"><w:body><w:p><w:r><w:t>Hello &amp; </w:t></w:r><w:hyperlink><w:r><w:t>world</w:t><w:tab/><w:t>tab</w:t><w:br/><w:t>line</w:t></w:r></w:hyperlink><w:del><w:r><w:delText>old</w:delText></w:r></w:del><w:ins><w:r><w:t>new</w:t></w:r></w:ins></w:p><w:p/><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Left</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Right</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`
};
export const pptxParts = {
  'ppt/presentation.xml': `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="${relNS}"><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="${packNS}"><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>`,
  'ppt/slides/slide1.xml':
    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>First file</a:t></a:r></a:p></p:sld>',
  'ppt/slides/slide2.xml':
    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Second file</a:t></a:r></a:p></p:sld>'
};
export const xlsxParts = {
  'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${relNS}"><sheets><sheet name="Report" r:id="s1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${packNS}"><Relationship Id="s1" Target="worksheets/sheet1.xml"/></Relationships>`,
  'xl/sharedStrings.xml':
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Hello </t></r><r><t>world</t></r></si></sst>',
  'xl/worksheets/sheet1.xml':
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>1+1</f><v>2</v></c><c r="C1" t="inlineStr"><is><t>inside</t><rPh sb="0" eb="6"><t>pronunciation</t></rPh></is></c><c r="D1" t="b"><v>1</v></c></row></sheetData></worksheet>'
};
// ZIP fixture writer (stored by default); compressed bytes can be supplied by Node zlib.
export function makeZip(parts, compress) {
  const encoder = new TextEncoder(),
    chunks = [],
    central = [];
  let offset = 0;
  const header = (size) => {
    const bytes = new Uint8Array(size);
    return [bytes, new DataView(bytes.buffer)];
  };
  for (const [path, value] of Object.entries(parts)) {
    const name = encoder.encode(path),
      plain = typeof value === 'string' ? encoder.encode(value) : value;
    const payload = compress ? new Uint8Array(compress(plain)) : plain;
    const [local, l] = header(30);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(8, compress ? 8 : 0, true);
    l.setUint32(14, crc32(plain), true);
    l.setUint32(18, payload.length, true);
    l.setUint32(22, plain.length, true);
    l.setUint16(26, name.length, true);
    const [entry, c] = header(46);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, compress ? 8 : 0, true);
    c.setUint32(16, crc32(plain), true);
    c.setUint32(20, payload.length, true);
    c.setUint32(24, plain.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    chunks.push(local, name, payload);
    central.push(entry, name);
    offset += local.length + name.length + payload.length;
  }
  const size = central.reduce((n, part) => n + part.length, 0),
    [end, e] = header(22);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, Object.keys(parts).length, true);
  e.setUint16(10, Object.keys(parts).length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const output = new Uint8Array(offset + size + 22);
  let cursor = 0;
  for (const part of [...chunks, ...central, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

import { t } from './i18n.js';
import { parseXML } from './xml.js';
import { openOfficeZip } from './zip.js';

const namespaces = {
  word: [
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'http://purl.oclc.org/ooxml/wordprocessingml/main'
  ],
  drawing: [
    'http://schemas.openxmlformats.org/drawingml/2006/main',
    'http://purl.oclc.org/ooxml/drawingml/main'
  ],
  presentation: [
    'http://schemas.openxmlformats.org/presentationml/2006/main',
    'http://purl.oclc.org/ooxml/presentationml/main'
  ],
  sheet: [
    'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'http://purl.oclc.org/ooxml/spreadsheetml/main'
  ]
};
const is = (node, family, name) =>
  namespaces[family].includes(node.namespaceURI) && node.localName === name;
const descendants = (node, family, name) =>
  [...node.getElementsByTagNameNS('*', name)].filter((child) => is(child, family, name));
export function decodeOfficeXML(bytes) {
  const encoding =
    (bytes[0] === 255 && bytes[1] === 254) || (bytes[0] === 60 && bytes[1] === 0)
      ? 'utf-16le'
      : (bytes[0] === 254 && bytes[1] === 255) || (bytes[0] === 0 && bytes[1] === 60)
        ? 'utf-16be'
        : 'utf-8';
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(t('Office: XML-Zeichenkodierung konnte nicht gelesen werden.'));
  }
}
export function wordText(document) {
  const root = document.documentElement;
  if (!is(root, 'word', 'document'))
    throw new Error(t('Office: Kein unterstütztes Word-Dokument.'));
  const body = [...root.children].find((node) => is(node, 'word', 'body'));
  if (!body) throw new Error(t('Office: Kein unterstütztes Word-Dokument.'));
  function visit(node) {
    if (['del', 'moveFrom', 'txbxContent'].some((name) => is(node, 'word', name))) return '';
    if (is(node, 'word', 't')) return node.textContent;
    if (is(node, 'word', 'tab')) return '\t';
    if (is(node, 'word', 'br') || is(node, 'word', 'cr')) return '\n';
    const text = [...node.children].map(visit).join('');
    if (is(node, 'word', 'p')) return text + '\n';
    if (is(node, 'word', 'tc')) return text.replace(/\n$/, '') + '\t';
    if (is(node, 'word', 'tr')) return text.replace(/\t$/, '') + '\n';
    return text;
  }
  return visit(body);
}
function relationId(node) {
  return (
    node.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'id'
    ) || node.getAttributeNS('http://purl.oclc.org/ooxml/officeDocument/relationships', 'id')
  );
}
export function resolvePart(base, target) {
  if (!target || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(target) || target.includes('\\'))
    throw new Error(t('Office: Externe oder ungültige Paketverknüpfung.'));
  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    throw new Error(t('Office: Externe oder ungültige Paketverknüpfung.'));
  }
  const parts = decoded.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error(t('Office: Externe oder ungültige Paketverknüpfung.'));
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}
// Keep the text-only API for callers that do not need section navigation.
export async function readOffice(buffer, format, isCurrent = () => true) {
  return (await readOfficeDocument(buffer, format, isCurrent)).text;
}
export async function readOfficeDocument(buffer, format, isCurrent = () => true) {
  if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
  const zip = openOfficeZip(buffer);
  const xml = async (name) => parseXML(decodeOfficeXML(await zip.read(name, isCurrent)));
  const relationships = async (name, base) => {
    const document = await xml(name),
      map = new Map();
    for (const rel of document.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/package/2006/relationships',
      'Relationship'
    )) {
      const id = rel.getAttribute('Id');
      if (map.has(id)) throw new Error(t('Office: Externe oder ungültige Paketverknüpfung.'));
      map.set(
        id,
        rel.getAttribute('TargetMode') === 'External'
          ? null
          : resolvePart(base, rel.getAttribute('Target'))
      );
    }
    return map;
  };
  let text = '';
  const sections = [];
  if (format === 'docx') text = wordText(await xml('word/document.xml'));
  else if (format === 'pptx') {
    const presentation = await xml('ppt/presentation.xml');
    if (!is(presentation.documentElement, 'presentation', 'presentation'))
      throw new Error(t('Office: Nicht unterstütztes Dateiformat.'));
    const rels = await relationships('ppt/_rels/presentation.xml.rels', 'ppt/presentation.xml');
    const slides = descendants(presentation, 'presentation', 'sldId');
    if (slides.length > 500) throw new Error(t('Office: Zu viele Folien oder Tabellenblätter.'));
    for (let i = 0; i < slides.length; i++) {
      const part = rels.get(relationId(slides[i]));
      if (!part) throw new Error(t('Office: Externe oder ungültige Paketverknüpfung.'));
      const slide = await xml(part);
      if (!is(slide.documentElement, 'presentation', 'sld'))
        throw new Error(t('Office: Nicht unterstütztes Dateiformat.'));
      sections.push({ label: i + 1, offset: text.length });
      text += `[slide:${i + 1}]` + '\n';
      for (const paragraph of descendants(slide, 'drawing', 'p')) {
        const visit = (node) =>
          is(node, 'drawing', 't')
            ? node.textContent
            : is(node, 'drawing', 'br')
              ? '\n'
              : [...node.children].map(visit).join('');
        text += visit(paragraph) + '\n';
      }
      text += '\n';
    }
  } else if (format === 'xlsx') {
    const workbook = await xml('xl/workbook.xml');
    if (!is(workbook.documentElement, 'sheet', 'workbook'))
      throw new Error(t('Office: Nicht unterstütztes Dateiformat.'));
    const rels = await relationships('xl/_rels/workbook.xml.rels', 'xl/workbook.xml');
    const shared = zip.has('xl/sharedStrings.xml')
      ? descendants(await xml('xl/sharedStrings.xml'), 'sheet', 'si').map((node) =>
          descendants(node, 'sheet', 't')
            .filter((node) => !is(node.parentNode, 'sheet', 'rPh'))
            .map((node) => node.textContent)
            .join('')
        )
      : [];
    const sheets = descendants(workbook, 'sheet', 'sheet');
    if (sheets.length > 500) throw new Error(t('Office: Zu viele Folien oder Tabellenblätter.'));
    for (const sheet of sheets) {
      const part = rels.get(relationId(sheet));
      if (!part) throw new Error(t('Office: Externe oder ungültige Paketverknüpfung.'));
      sections.push({ label: sheet.getAttribute('name'), offset: text.length });
      text += `[sheet:${JSON.stringify(sheet.getAttribute('name'))}]` + '\n';
      const document = await xml(part);
      if (!is(document.documentElement, 'sheet', 'worksheet'))
        throw new Error(t('Office: Nicht unterstütztes Dateiformat.'));
      for (const cell of descendants(document, 'sheet', 'c')) {
        const address = cell.getAttribute('r');
        if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address))
          throw new Error(t('Office: Ungültige Zelladresse oder Zeichenkette.'));
        const type = cell.getAttribute('t');
        let value = descendants(cell, 'sheet', 'v')[0]?.textContent ?? '';
        if (type === 's') {
          if (!/^\d+$/.test(value) || Number(value) >= shared.length)
            throw new Error(t('Office: Ungültige Zelladresse oder Zeichenkette.'));
          value = shared[Number(value)];
        } else if (type === 'inlineStr')
          value = descendants(cell, 'sheet', 't')
            .filter((node) => !is(node.parentNode, 'sheet', 'rPh'))
            .map((node) => node.textContent)
            .join('');
        const formula = descendants(cell, 'sheet', 'f')[0];
        // Escaped strings keep tabs/newlines and missing cached values unambiguous.
        const valueType = ['s', 'inlineStr', 'str'].includes(type) ? 'text' : type || 'n';
        const formulaData = formula
          ? {
              text: formula.textContent,
              attributes: Object.fromEntries(
                [...formula.attributes].map((attribute) => [attribute.name, attribute.value]).sort()
              )
            }
          : null;
        text +=
          address +
          '\t' +
          valueType +
          '\t' +
          JSON.stringify(value) +
          (formulaData ? '\t=' + JSON.stringify(formulaData) : '') +
          '\n';
      }
      text += '\n';
    }
  } else throw new Error(t('Office: Nicht unterstütztes Dateiformat.'));
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024 || text.split('\n').length > 20001)
    throw new Error(t('Office: Extrahierter Text überschreitet 2 MiB oder 20.000 Zeilen.'));
  // Derive line positions from trusted package structure, never from text that
  // happens to look like a [slide:…] or [sheet:…] marker inside a document.
  let offset = 0,
    line = 1;
  return {
    text,
    format,
    sections: sections.map((section) => {
      while (offset < section.offset) if (text[offset++] === '\n') line++;
      return { label: section.label, line };
    })
  };
}

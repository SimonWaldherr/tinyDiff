import { t } from './i18n.js';

// Parse inert XML; never attach supplied nodes to the application document.
export function parseXML(text, Parser = globalThis.DOMParser) {
  if (!Parser) throw new Error(t('Dieser Browser unterstützt den XML-Vergleich nicht.'));
  if (/<!DOCTYPE\b/i.test(text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, '')))
    throw new Error(t('XML: DOCTYPE-Deklarationen werden nicht unterstützt.'));
  const document = new Parser().parseFromString(text, 'application/xml');
  if (
    ['http://www.mozilla.org/newlayout/xml/parsererror.xml', 'http://www.w3.org/1999/xhtml'].some(
      (namespace) => document.getElementsByTagNameNS(namespace, 'parsererror').length
    ) ||
    !document.documentElement
  ) {
    throw new Error(t('XML: Bitte auf beiden Seiten ein gültiges XML-Dokument eingeben.'));
  }
  const pending = [[document.documentElement, 0]];
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (++count > 20000)
      throw new Error(t('XML enthält zu viele Knoten (maximal 20.000 pro Seite).'));
    if (depth > 200) throw new Error(t('XML ist zu tief verschachtelt (maximal 200 Ebenen).'));
    for (const child of node.childNodes)
      pending.push([child, depth + (child.nodeType === 1 ? 1 : 0)]);
  }
  return document;
}

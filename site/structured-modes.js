import { parseXML } from './xml.js';
import { t } from './i18n.js';
import { jsonTree } from './modes.js';

const MAX_NODES = 20000;
const escapePath = (value) => value.replace(/~/g, '~0').replace(/\//g, '~1');
function compareNodes(a, b) {
  return [...new Set([...a.keys(), ...b.keys()])].map((path) => {
    const old = a.get(path),
      next = b.get(path);
    return {
      path,
      old: old?.value,
      new: next?.value,
      type: !old
        ? 'add'
        : !next
          ? 'remove'
          : old.type === next.type && old.value === next.value
            ? 'equal'
            : 'change'
    };
  });
}
function jsonLinesTree(text) {
  const rows = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  if (rows.at(-1) === '') rows.pop();
  const nodes = new Map();
  for (let i = 0; i < rows.length; i++) {
    let tree;
    try {
      tree = jsonTree(rows[i]);
    } catch {
      throw new Error(
        t(
          'JSON Lines: Zeile {line} muss einen gültigen JSON-Wert enthalten (maximal 200 Ebenen / 20.000 Knoten).',
          { line: i + 1 }
        )
      );
    }
    for (const [path, value] of tree) {
      if (nodes.size >= MAX_NODES)
        throw new Error(t('JSON Lines enthält zu viele Knoten (maximal 20.000 pro Seite).'));
      nodes.set(t('Zeile {line}{path}', { line: i + 1, path: path || ' ' + t('(Wurzel)') }), value);
    }
  }
  return nodes;
}
export function compareJSONLines(before, after) {
  return compareNodes(jsonLinesTree(before), jsonLinesTree(after));
}

// DOMParser produces an inert XML document: nothing is inserted into the live page.
export function xmlTree(text, Parser = globalThis.DOMParser) {
  const document = parseXML(text, Parser);
  const nodes = new Map();
  const add = (path, type, value) => {
    if (nodes.size >= MAX_NODES)
      throw new Error(t('XML enthält zu viele Knoten (maximal 20.000 pro Seite).'));
    nodes.set(path, { type, value });
  };
  const visit = (node, path, depth, inheritedSpace = false) => {
    const xmlSpace = node.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space');
    const preserveSpace = xmlSpace === 'preserve' || (xmlSpace !== 'default' && inheritedSpace);
    const mixedContent = [...node.childNodes].some(
      (child) => (child.nodeType === 3 || child.nodeType === 4) && child.nodeValue.trim()
    );
    if (depth > 200) throw new Error(t('XML ist zu tief verschachtelt (maximal 200 Ebenen).'));
    add(path, 'element', `<${node.nodeName}>${node.namespaceURI ? ` · ${node.namespaceURI}` : ''}`);
    for (const attribute of [...node.attributes].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    )) {
      add(
        path + '/@' + escapePath(attribute.name),
        'attribute:' + (attribute.namespaceURI || ''),
        attribute.value
      );
    }
    const indices = new Map();
    let pendingText = '',
      textIndex = 0;
    const contentOrder = [];
    const flush = () => {
      if (pendingText && (preserveSpace || mixedContent || pendingText.trim())) {
        const key = `text()[${++textIndex}]`;
        add(path + '/' + key, 'text', pendingText);
        contentOrder.push(key);
      }
      pendingText = '';
    };
    for (const child of node.childNodes) {
      if (child.nodeType === 3 || child.nodeType === 4) pendingText += child.nodeValue;
      else if (child.nodeType === 1) {
        flush();
        const key = child.nodeName;
        const index = (indices.get(key) || 0) + 1;
        indices.set(key, index);
        const childPath = escapePath(key) + `[${index}]`;
        contentOrder.push(childPath);
        visit(child, path + '/' + childPath, depth + 1, preserveSpace);
      }
    }
    flush();
    add(path + '/content-order()', 'order', contentOrder.join(' → '));
  };
  visit(document.documentElement, '/' + escapePath(document.documentElement.nodeName) + '[1]', 0);
  return nodes;
}
export function compareXML(before, after) {
  return compareNodes(xmlTree(before), xmlTree(after));
}

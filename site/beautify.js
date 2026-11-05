import { t } from './i18n.js';
import { parseXML } from './xml.js';

// Validate JSON, but format its original tokens: numbers and duplicate keys must
// survive without JSON.parse/stringify's rounding or key replacement.
export function formatJSON(source, compact = false) {
  try {
    JSON.parse(source);
  } catch {
    throw new Error(t('JSON: Bitte gültiges JSON eingeben.'));
  }
  const tokens =
    source.match(
      /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g
    ) || [];
  if (compact) {
    let depth = 0;
    for (const token of tokens) {
      if (token === '{' || token === '[') depth++;
      if (token === '}' || token === ']') depth--;
      if (depth > 200) throw new Error(t('JSON ist zu tief verschachtelt (maximal 200 Ebenen).'));
    }
    return tokens.join('');
  }
  let depth = 0,
    output = '';
  const newline = () => '\n' + '  '.repeat(depth);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') {
      if (++depth > 200) throw new Error(t('JSON ist zu tief verschachtelt (maximal 200 Ebenen).'));
      output += token;
      if (tokens[i + 1] !== '}' && tokens[i + 1] !== ']') output += newline();
    } else if (token === '}' || token === ']') {
      depth--;
      if (tokens[i - 1] !== '{' && tokens[i - 1] !== '[') output += newline();
      output += token;
    } else if (token === ',') output += ',' + newline();
    else if (token === ':') output += ': ';
    else output += token;
  }
  return output;
}

export function formatXML(source, compact = false) {
  const document = parseXML(source);
  const elements = document.getElementsByTagName('*');
  let elementIndex = 0;
  const tokens =
    source.match(
      /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g
    ) || [];
  const root = { children: [], document: true },
    stack = [root];
  for (const token of tokens) {
    const parent = stack.at(-1);
    if (/^<\//.test(token)) {
      parent.close = token;
      stack.pop();
    } else if (/^<(?![!?])/.test(token)) {
      // DOM attribute values include character-reference expansion; a regex on
      // the opening tag can confuse quoted text with an actual xml:space.
      const space = elements[elementIndex++].getAttributeNS(
        'http://www.w3.org/XML/1998/namespace',
        'space'
      );
      const element = {
        open: token,
        close: '',
        children: [],
        preserve: space === 'preserve' || (space !== 'default' && parent.preserve)
      };
      parent.children.push(element);
      if (!/\/\s*>$/.test(token)) stack.push(element);
    } else parent.children.push(token);
  }
  const raw = (node) =>
    typeof node === 'string' ? node : node.open + node.children.map(raw).join('') + node.close;
  const render = (node, depth) => {
    if (typeof node === 'string') return node;
    const hasElements = node.children.some((child) => typeof child !== 'string');
    const hasText = node.children.some(
      (child) =>
        typeof child === 'string' &&
        (child.startsWith('<![CDATA[') || (!child.startsWith('<') && /\S/.test(child)))
    );
    const layout = node.document || (!node.preserve && hasElements && !hasText);
    if (!layout) return raw(node);
    const children = node.children.filter((child) => typeof child !== 'string' || /\S/.test(child));
    if (compact)
      return (
        (node.open || '') +
        children.map((child) => render(child, depth + 1)).join('') +
        (node.close || '')
      );
    const indent = '  '.repeat(depth);
    const innerDepth = node.document ? depth : depth + 1;
    const body = children
      .map((child) => '  '.repeat(innerDepth) + render(child, innerDepth))
      .join('\n');
    return node.document ? body : node.open + '\n' + body + '\n' + indent + node.close;
  };
  return render(root, 0);
}

// Offer editing tools only for complete, supported structured input.
export function detectFormat(source) {
  const text = source.trim();
  if (!text || source.length > 2 * 1024 * 1024) return null;
  try {
    JSON.parse(text);
    return 'json';
  } catch {
    /* Try XML next. */
  }
  if (!text.startsWith('<')) return null;
  try {
    parseXML(source);
    return 'xml';
  } catch {
    return null;
  }
}

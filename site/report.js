import { t } from './i18n.js';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const tags = new Set([
  'section',
  'div',
  'p',
  'span',
  'strong',
  'table',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'mark',
  'details',
  'summary',
  'figure',
  'figcaption'
]);

// Serialize only generated report content, never application controls, URLs or
// event attributes. Filtered unchanged rows remain part of the complete report.
function appendContent(node, includeExif, write) {
  if (node.nodeType === 3) {
    write(escape(node.textContent));
    return;
  }
  if (node.nodeType !== 1) return;
  if (node.dataset.reportOmit || (!includeExif && node.classList.contains('image-metadata')))
    return;
  const tag = node.localName;
  if (tag === 'canvas') {
    const src = node.toDataURL('image/png');
    if (!src.startsWith('data:image/png;base64,')) throw new Error('Invalid PNG');
    write(`<img src="${src}" alt="${escape(node.getAttribute('aria-label') || '')}">`);
    return;
  }
  if (tag === 'button') {
    write(escape(node.textContent));
    return;
  }
  if (!tags.has(tag) || node.classList.contains('image-controls')) return;
  if (node.classList.contains('image-stage') && node.hidden) return;
  const attrs = [];
  const classes = [...node.classList].filter((name) => !['hidden', 'active'].includes(name));
  if (classes.length) attrs.push(`class="${escape(classes.join(' '))}"`);
  for (const name of ['scope', 'colspan', 'dir', 'aria-label', 'title']) {
    if (node.hasAttribute(name)) attrs.push(`${name}="${escape(node.getAttribute(name))}"`);
  }
  if (tag === 'details') attrs.push('open');
  write(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
  if (tag === 'col') return;
  for (const child of node.childNodes) appendContent(child, includeExif, write);
  write(`</${tag}>`);
}

const styles = `
:root{color-scheme:light}body{font:16px/1.5 system-ui,sans-serif;color:#18252f;background:white;margin:0 auto;padding:2rem;max-width:100rem}
h1{margin-top:0}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.4rem 1rem}dd{margin:0;overflow-wrap:anywhere}
.result{overflow-x:auto}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:1rem 0;font:14px/1.5 ui-monospace,monospace}
th,td{border:1px solid #bac4cc;padding:.45rem;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;text-align:start}
th{background:#edf1f4}.num{width:4em;color:#46545e}.sign{width:2em}.remove{background:#fbe9e7;color:#751e1a}.add{background:#e0f3e9;color:#145c3d}
mark{color:inherit;background:transparent;font-weight:bold;text-decoration:underline;text-decoration-thickness:2px}
.eof{font:12px system-ui,sans-serif;margin-inline-start:.5rem}.image-controls,.metadata-filter{display:none}figure{margin:1rem 0}img{max-width:100%;height:auto;border:1px solid #bac4cc}
summary{font-weight:bold}.metadata-state{margin-inline-end:.5rem}.notice{padding:1rem;border:1px solid #bac4cc;background:#f4f6f8}
@media(min-width:800px){.image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}}
@media(max-width:600px){body{padding:1rem}dl{display:block}dt{font-weight:bold}dd{margin:0 0 .7rem}}
@media print{body{padding:0}.result{overflow:visible}thead{display:table-header-group}tr,img{break-inside:avoid}}
`;

const MAX_REPORT_BYTES = 64 * 1024 * 1024;

export function createReport({
  language,
  settings,
  summary,
  content,
  includeExif = false,
  maxBytes = MAX_REPORT_BYTES
}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid report limit');
  const limit = Math.min(maxBytes, MAX_REPORT_BYTES);
  const encoder = new TextEncoder();
  const chunks = [];
  let size = 0;
  const write = (chunk) => {
    size += encoder.encode(chunk).byteLength;
    if (size > limit) throw new RangeError('Report size limit');
    chunks.push(chunk);
  };
  const title = t('Vergleichsbericht');
  const notice = includeExif
    ? t(
        'Dieser Bericht enthält Vergleichsinhalte und gegebenenfalls EXIF-Daten einschließlich GPS. Vor der Weitergabe prüfen.'
      )
    : t('Dieser Bericht enthält Vergleichsinhalte. Vor der Weitergabe prüfen.');
  write(`<!doctype html>
<html lang="${escape(language)}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tinyDiff · ${escape(title)}</title><style>${styles}</style></head>
<body><h1>tinyDiff · ${escape(title)}</h1>
<p class="notice">${escape(notice)}</p>
<dl>`);
  for (const [key, value] of settings)
    write(`<dt>${escape(key)}</dt><dd dir="auto">${escape(value)}</dd>`);
  write(`</dl><p>${escape(summary)}</p><main class="result">`);
  appendContent(content, includeExif, write);
  write('</main></body></html>');
  return chunks.join('');
}

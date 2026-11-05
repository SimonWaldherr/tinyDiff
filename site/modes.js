import { t } from './i18n.js';
// Browser-independent helpers for structured, image and directory comparisons.
export function jsonTree(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(t('JSON: Bitte auf beiden Seiten gültiges JSON eingeben.'));
  }
  const nodes = new Map();
  const visit = (value, path, depth) => {
    if (nodes.size >= 20000) throw new Error(t('JSON enthält zu viele Knoten (maximal 20.000).'));
    if (depth > 200) throw new Error(t('JSON ist zu tief verschachtelt (maximal 200 Ebenen).'));
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    nodes.set(path, {
      type,
      value:
        typeof value === 'object' && value !== null
          ? type === 'array'
            ? `[${value.length}]`
            : '{}'
          : JSON.stringify(value)
    });
    if (value !== null && typeof value === 'object')
      for (const key of Object.keys(value).sort()) {
        visit(value[key], path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'), depth + 1);
      }
  };
  visit(value, '', 0);
  return nodes;
}
export function compareJSON(before, after) {
  const a = jsonTree(before),
    b = jsonTree(after);
  return [...new Set([...a.keys(), ...b.keys()])].sort().map((path) => {
    const old = a.get(path),
      next = b.get(path);
    return {
      path: path || t('(Wurzel)'),
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
export function directoryEntries(files) {
  const entries = new Map();
  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    const path = file.webkitRelativePath ? relative.split('/').slice(1).join('/') : relative;
    if (entries.has(path)) throw new Error(t('Doppelter Dateipfad: {path}', { path }));
    entries.set(path, file);
  }
  return entries;
}
export function equalBytes(a, b) {
  const x = new Uint8Array(a),
    y = new Uint8Array(b);
  return x.length === y.length && x.every((value, i) => value === y[i]);
}
export function pixelDiff(a, b, width, height, options = {}) {
  const tolerance = Math.max(0, Math.min(255, Number(options.tolerance) || 0));
  const output = new Uint8ClampedArray(width * height * 4);
  let changed = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        ai = (y * a.width + x) * 4,
        bi = (y * b.width + x) * 4;
      const outsideA = x >= a.width || y >= a.height,
        outsideB = x >= b.width || y >= b.height;
      if (outsideA && outsideB) continue;
      const outside = outsideA || outsideB;
      const different =
        outside ||
        Math.abs(a.data[ai] - b.data[bi]) > tolerance ||
        Math.abs(a.data[ai + 1] - b.data[bi + 1]) > tolerance ||
        Math.abs(a.data[ai + 2] - b.data[bi + 2]) > tolerance ||
        (!options.ignoreAlpha && Math.abs(a.data[ai + 3] - b.data[bi + 3]) > tolerance);
      if (different) {
        changed++;
        output.set([230, 55, 115, 255], i);
      } else {
        const grey = Math.round((a.data[ai] + a.data[ai + 1] + a.data[ai + 2]) / 3);
        output.set([grey, grey, grey, 70], i);
      }
    }
  return { data: output, changed };
}

import { comparisonKey } from './comparison-key.js';
// Myers shortest edit script, with a bounded fallback for very different inputs.
// No browser dependencies: the same implementation is tested in Node.
export function sequenceDiff(a, b, key = (x) => x, maxDistance = 1200) {
  let start = 0,
    endA = a.length,
    endB = b.length;
  while (start < endA && start < endB && key(a[start]) === key(b[start])) start++;
  while (endA > start && endB > start && key(a[endA - 1]) === key(b[endB - 1])) {
    endA--;
    endB--;
  }
  const result = a.slice(0, start).map((value, i) => ({ type: 'equal', old: value, new: b[i] }));
  const aa = a.slice(start, endA),
    bb = b.slice(start, endB);
  const ak = aa.map(key),
    bk = bb.map(key);
  let middle,
    approximate = false;
  if (!aa.length) middle = bb.map((value) => ({ type: 'add', new: value }));
  else if (!bb.length) middle = aa.map((value) => ({ type: 'remove', old: value }));
  else {
    const trace = [],
      v = new Map([[1, 0]]);
    outer: for (let d = 0; d <= Math.min(aa.length + bb.length, maxDistance); d++) {
      trace.push(new Map(v));
      for (let k = -d; k <= d; k += 2) {
        const down = v.get(k + 1) ?? -Infinity,
          right = v.get(k - 1) ?? -Infinity;
        let x = k === -d || (k !== d && right < down) ? down : right + 1;
        let y = x - k;
        while (x < aa.length && y < bb.length && ak[x] === bk[y]) {
          x++;
          y++;
        }
        v.set(k, x);
        if (x >= aa.length && y >= bb.length) {
          middle = [];
          let xx = aa.length,
            yy = bb.length;
          for (let dd = d; dd >= 0; dd--) {
            const vv = trace[dd],
              kk = xx - yy;
            const prevK =
              kk === -dd ||
              (kk !== dd && (vv.get(kk - 1) ?? -Infinity) < (vv.get(kk + 1) ?? -Infinity))
                ? kk + 1
                : kk - 1;
            const prevX = vv.get(prevK) ?? 0,
              prevY = prevX - prevK;
            while (xx > prevX && yy > prevY)
              middle.push({ type: 'equal', old: aa[--xx], new: bb[--yy] });
            if (dd) {
              if (xx === prevX) middle.push({ type: 'add', new: bb[--yy] });
              else middle.push({ type: 'remove', old: aa[--xx] });
            }
          }
          middle.reverse();
          break outer;
        }
      }
    }
    if (!middle) {
      approximate = true;
      middle = [
        ...aa.map((value) => ({ type: 'remove', old: value })),
        ...bb.map((value) => ({ type: 'add', new: value }))
      ];
    }
  }
  result.push(...middle);
  for (let i = endA, j = endB; i < a.length; i++, j++)
    result.push({ type: 'equal', old: a[i], new: b[j] });
  return { ops: result, approximate };
}
export const normalize = (text) => text.replace(/\r\n?/g, '\n');
export const lines = (text) => normalize(text).match(/[^\n]*\n|[^\n]+$/g) || [];
export const visible = (text) => (text ?? '').replace(/\n$/, '');
export function compare(before, after, options = {}) {
  const key = (s) => {
    // Keep the final newline significant, even when ignoring spaces.
    const eol = s.endsWith('\n') ? '\n' : '';
    let body = visible(s);
    body = comparisonKey(body, options);
    return body + eol;
  };
  return sequenceDiff(lines(before), lines(after), key);
}
export function inlineParts(before, after, mode = 'words') {
  const tokenize = (s) => s.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
  const split =
    mode === 'characters'
      ? (s) =>
          typeof Intl.Segmenter === 'function'
            ? [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(s)].map(
                (part) => part.segment
              )
            : Array.from(s)
      : tokenize;
  const a = split(visible(before)),
    b = split(visible(after));
  if (a.length + b.length > 600) return null;
  return sequenceDiff(a, b, (x) => x, 160).ops;
}
export function unifiedPatch(ops, oldName = 'original.txt', newName = 'geändert.txt', context = 3) {
  const safe = (prefix, name) => {
    // File inputs may supply directory paths. Keep safe relative paths only.
    const path =
      String(name)
        .replace(/[\x00-\x1f\x7f\\:]/g, '_')
        .split('/')
        .filter((part) => part && part !== '.' && part !== '..')
        .join('/') || 'text.txt';
    const full = prefix + '/' + path;
    return /[\s"]/u.test(full) ? JSON.stringify(full) : full;
  };
  const changes = ops.map((o, i) => (o.type !== 'equal' ? i : -1)).filter((i) => i >= 0);
  if (!changes.length) return '';
  const ranges = [];
  for (const i of changes) {
    const start = Math.max(0, i - context),
      end = Math.min(ops.length, i + context + 1),
      last = ranges.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  let patch = `--- ${safe('a', oldName)}\n+++ ${safe('b', newName)}\n`,
    old = 0,
    next = 0,
    cursor = 0;
  const range = (start, count) => `${count ? start + 1 : start},${count}`;
  for (const [start, end] of ranges) {
    while (cursor < start) {
      const o = ops[cursor++];
      if (o.type !== 'add') old++;
      if (o.type !== 'remove') next++;
    }
    const block = ops.slice(start, end),
      oldCount = block.filter((o) => o.type !== 'add').length,
      newCount = block.filter((o) => o.type !== 'remove').length;
    patch += `@@ -${range(old, oldCount)} +${range(next, newCount)} @@\n`;
    for (const o of block) {
      const content = o.type === 'add' ? o.new : o.old;
      patch += { equal: ' ', add: '+', remove: '-' }[o.type] + visible(content) + '\n';
      if (!content.endsWith('\n')) patch += '\\ No newline at end of file\n';
      if (o.type !== 'add') old++;
      if (o.type !== 'remove') next++;
    }
    cursor = end;
  }
  return patch;
}

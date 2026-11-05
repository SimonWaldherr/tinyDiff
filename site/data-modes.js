import { formatNumber } from './format.js';
import { t } from './i18n.js';
// Structured text comparisons. All values remain strings and are rendered as data.
const MAX_ROWS = 10000,
  MAX_CELLS = 20000;
const delimiters = [',', ';', '\t'];
const normalize = (text) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

function parseDelimited(text, delimiter) {
  text = normalize(text);
  if (!text) return [];
  const rows = [];
  let row = [],
    value = '',
    quoted = false,
    closed = false,
    cells = 0;
  const fail = (message) => {
    throw new Error(t('CSV/TSV, Zeile {line}: {message}', { line: rows.length + 1, message }));
  };
  const field = () => {
    if (++cells > MAX_CELLS)
      throw new Error(
        t('CSV/TSV: Maximal {limit} Zellen pro Seite.', { limit: formatNumber(MAX_CELLS) })
      );
    row.push(value);
    value = '';
    closed = false;
  };
  const record = () => {
    field();
    rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS)
      throw new Error(
        t('CSV/TSV: Maximal {limit} Datensätze pro Seite.', { limit: formatNumber(MAX_ROWS) })
      );
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === delimiter) field();
    else if (char === '\n') record();
    else if (closed)
      fail(
        t(
          'Nach einem schließenden Anführungszeichen ist nur ein Trennzeichen oder Zeilenende erlaubt.'
        )
      );
    else if (char === '"') {
      if (value)
        fail(
          t(
            'Anführungszeichen müssen am Feldanfang stehen; innere Anführungszeichen bitte verdoppeln.'
          )
        );
      quoted = true;
    } else value += char;
  }
  if (quoted) fail(t('Nicht geschlossenes Anführungszeichen.'));
  // A final record separator terminates a record rather than creating another one.
  if (!text.endsWith('\n') || row.length || value || closed) record();
  return rows;
}

function table(text, delimiter) {
  if (delimiter !== 'auto') return parseDelimited(text, delimiter);
  // Count separators outside quoted fields before parsing. Never recover from a
  // malformed or oversized table by silently treating it as a single column.
  const records = [new Map(), new Map(), new Map()];
  let counts = [0, 0, 0],
    quoted = false,
    rowCount = 0;
  const record = () => {
    rowCount++;
    counts.forEach((count, i) => records[i].set(count, (records[i].get(count) || 0) + 1));
    counts = [0, 0, 0];
  };
  const input = normalize(text);
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\n') record();
      else {
        const index = delimiters.indexOf(char);
        if (index >= 0) counts[index]++;
      }
    }
  }
  if (input && !input.endsWith('\n')) record();
  let selected = ',',
    best = -1;
  records.forEach((frequency, i) => {
    let common = 0,
      total = 0;
    for (const [count, times] of frequency)
      if (count) {
        common = Math.max(common, times);
        total += count * times;
      }
    const score = common ? (common / Math.max(1, rowCount)) * 100000 + total : 0;
    if (score > best) {
      best = score;
      selected = delimiters[i];
    }
  });
  return parseDelimited(input, selected);
}

export function compareTable(before, after, { delimiter = 'auto' } = {}) {
  if (delimiter !== 'auto' && !delimiters.includes(delimiter))
    throw new Error(t('CSV/TSV: Unbekanntes Trennzeichen.'));
  const a = table(before, delimiter),
    b = table(after, delimiter),
    entries = [];
  for (let row = 0; row < Math.max(a.length, b.length); row++) {
    for (let column = 0; column < Math.max(a[row]?.length || 0, b[row]?.length || 0); column++) {
      if (entries.length >= MAX_CELLS)
        throw new Error(
          t('CSV/TSV: Der Vergleich umfasst mehr als {limit} Zellpositionen.', {
            limit: formatNumber(MAX_CELLS)
          })
        );
      const old = a[row]?.[column],
        next = b[row]?.[column];
      entries.push({
        path: t('Zeile {row} / Spalte {column}', { row: row + 1, column: column + 1 }),
        old,
        new: next,
        type:
          old === undefined
            ? 'add'
            : next === undefined
              ? 'remove'
              : old === next
                ? 'equal'
                : 'change'
      });
    }
  }
  return entries;
}

function config(text) {
  const entries = new Map();
  let section = '';
  for (const [index, raw] of normalize(text).split('\n').entries()) {
    const line = raw.trim();
    const fail = (message) => {
      throw new Error(t('INI/.env, Zeile {line}: {message}', { line: index + 1, message }));
    };
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[')) {
      if (!/^\[[^\[\]\r\n]+\]$/.test(line))
        fail(t('Ungültiger Abschnitt. Erwartet wird [Abschnitt] ohne nachfolgenden Kommentar.'));
      section = line.slice(1, -1).trim();
      if (!section) fail(t('Der Abschnittsname darf nicht leer sein.'));
      continue;
    }
    const assignment = line.replace(/^export\s+/, '');
    const separator = assignment.indexOf('=');
    if (separator < 0)
      fail(
        t(
          'Erwartet wird Schlüssel=Wert. Mehrzeilige Werte und Fortsetzungszeilen werden nicht unterstützt.'
        )
      );
    const key = assignment.slice(0, separator).trim(),
      value = assignment.slice(separator + 1).trim();
    if (
      (value.startsWith('\"') || value.startsWith("'")) &&
      (value.length < 2 || value.at(-1) !== value[0])
    )
      fail(
        t(
          'Nicht geschlossener oder mehrzeiliger zitierter Wert. Werte müssen in einer Zeile stehen.'
        )
      );
    if (!key || /[\[\]\s]/u.test(key))
      fail(t('Schlüssel dürfen weder leer sein noch Leerraum oder eckige Klammern enthalten.'));
    // JSON tuples avoid collisions between section/key names containing slashes.
    const identity = JSON.stringify([section, key]);
    if (entries.has(identity))
      fail(t('Doppelter Schlüssel {key}.', { key: section ? '[' + section + '] ' + key : key }));
    if (entries.size >= MAX_CELLS)
      fail(t('Maximal {limit} Schlüssel pro Seite.', { limit: formatNumber(MAX_CELLS) }));
    entries.set(identity, { path: section ? `[${section}] ${key}` : key, value });
  }
  return entries;
}

export function compareConfig(before, after) {
  const a = config(before),
    b = config(after);
  return [...new Set([...a.keys(), ...b.keys()])].sort().map((identity) => {
    const old = a.get(identity),
      next = b.get(identity);
    return {
      path: (old || next).path,
      old: old?.value,
      new: next?.value,
      type: !old ? 'add' : !next ? 'remove' : old.value === next.value ? 'equal' : 'change'
    };
  });
}

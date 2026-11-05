import { inlineParts } from './diff.js';
import { compareExif } from './exif.js';
import { t } from './i18n.js';
import { count } from './format.js';

export function createExifView(a, b) {
  const details = document.createElement('details');
  details.className = 'image-metadata';
  const summary = document.createElement('summary');
  details.append(summary);
  const states = {
    ok: 'EXIF gelesen.',
    absent: 'Keine EXIF-Daten vorhanden.',
    unsupported: 'EXIF wird für dieses Bildformat nicht unterstützt.',
    error: 'EXIF ist beschädigt, zu groß oder nicht unterstützt. Pixelvergleich bleibt verfügbar.'
  };
  for (const [name, value] of [
    ['Original', a],
    ['Änderung', b]
  ]) {
    const p = document.createElement('p');
    p.textContent = `${t(name)}: ${t(states[value.status])}`;
    details.append(p);
  }
  if ([a, b].some((value) => !['ok', 'absent'].includes(value.status))) {
    summary.textContent = t('EXIF-Metadaten · Vergleich nicht verfügbar');
    return details;
  }
  const rows = compareExif(a.tags, b.tags);
  summary.textContent = t('EXIF-Metadaten · {count}', {
    count: count(rows.filter((row) => row.type !== 'equal').length, 'Unterschied', 'Unterschiede')
  });
  const note = document.createElement('p');
  note.textContent = t(
    'EXIF wird separat verglichen und kann GPS- oder Kameradaten enthalten. Datumswerte bleiben unverändert. Vorschaubilder, XMP und ICC werden nicht verglichen; MakerNote wird nur als Rohwert gelesen.'
  );
  if (a.tags.get('IFD0/ImageDescription')?.value.startsWith?.('Synthetic illustration:')) {
    const demo = document.createElement('p');
    demo.textContent = t(
      'Demo: synthetische Aufnahme am Eibsee in Bayern, 21.06.2026 um 06:40 und 07:05 Uhr (UTC+02:00). GPS bezeichnet einen öffentlichen Standort; die Illustration bildet keinen berechneten Sonnenstand ab.'
    );
    details.append(demo);
  }
  details.append(note);
  if (!rows.length) return details;
  const table = document.createElement('table');
  table.className = 'entry-table';
  table.setAttribute('aria-label', t('EXIF-Metadaten'));
  const head = table.createTHead().insertRow();
  for (const key of ['EXIF-Tag', 'Original', 'Änderung']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = t(key);
    head.append(th);
  }
  const body = table.createTBody();
  const statuses = {
    equal: 'Unverändert',
    add: 'Hinzugefügt',
    remove: 'Entfernt',
    change: 'Geändert'
  };
  const filter = document.createElement('label');
  filter.className = 'metadata-filter';
  const changesOnly = document.createElement('input');
  changesOnly.type = 'checkbox';
  filter.append(changesOnly, document.createTextNode(t('Nur Änderungen')));
  details.append(filter);
  for (const row of rows) {
    const tr = body.insertRow();
    tr.className = row.type;
    const path = document.createElement('th');
    path.scope = 'row';
    path.className = 'entry-path';
    path.setAttribute('aria-label', `${row.path}: ${t(statuses[row.type])}`);
    path.title = t(statuses[row.type]);
    if (row.type !== 'equal') {
      const symbol = document.createElement('span');
      symbol.className = 'metadata-state';
      symbol.setAttribute('aria-hidden', 'true');
      symbol.textContent = { add: '+', remove: '−', change: '↔' }[row.type];
      path.append(symbol);
    }
    path.append(document.createTextNode(row.path));
    tr.append(path);
    const before = row.before === undefined ? '—' : JSON.stringify(row.before.value);
    const after = row.after === undefined ? '—' : JSON.stringify(row.after.value);
    const parts =
      row.type === 'change' && before.length + after.length <= 600
        ? inlineParts(before, after, 'characters')
        : null;
    for (const [side, value] of [
      ['old', before],
      ['new', after]
    ]) {
      const td = tr.insertCell();
      td.dir = 'auto';
      const changed =
        side === 'old'
          ? row.type === 'change' || row.type === 'remove'
          : row.type === 'change' || row.type === 'add';
      if (changed) td.className = side === 'old' ? 'remove' : 'add';
      const original = side === 'old' ? row.before : row.after;
      if (original) td.title = `${t('Art')}: ${original.type}`;
      if (parts) {
        for (const part of parts) {
          if ((side === 'old' && part.type === 'add') || (side === 'new' && part.type === 'remove'))
            continue;
          const text = side === 'old' ? part.old : part.new;
          if (part.type === 'equal') td.append(document.createTextNode(text));
          else {
            const mark = document.createElement('mark');
            mark.textContent = text;
            td.append(mark);
          }
        }
      } else td.textContent = value;
      td.normalize();
    }
  }
  changesOnly.addEventListener('change', () => {
    for (const row of body.rows)
      row.hidden = changesOnly.checked && row.classList.contains('equal');
  });
  details.append(table);
  return details;
}

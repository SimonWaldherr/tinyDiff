import { createReport } from './report.js';
import { sourceLanguages, sourceLanguageForFile } from './source-languages.js';
import { readImageExif } from './exif.js';
import { createImageDemo } from './image-demo.js';
import { readOfficeDocument } from './office.js';
import { MAX_OFFICE_BYTES } from './zip.js';
import { createImageView } from './image-view.js';
import { formatJSON, formatXML, detectFormat } from './beautify.js';
import { createModePicker } from './mode-picker.js';
import { t, getLanguage, setLanguage, localizeDocument } from './i18n.js';
import { formatNumber, count, formatBytes } from './format.js';
import { compareXML } from './structured-modes.js';
import { MAX_BINARY_BYTES } from './binary-mode.js';
import { directoryEntries, equalBytes } from './modes.js';
import { lines, visible, inlineParts, unifiedPatch } from './diff.js';
const $ = (id) => document.getElementById(id);
const inputs = { before: $('before'), after: $('after') };
const names = { before: 'original.txt', after: 'modified.txt' };
const MAX_BYTES = 2 * 1024 * 1024,
  MAX_LINES = 20000;
let worker,
  timer,
  request = 0,
  result = null,
  view = 'split',
  anchors = [],
  current = -1;
let fileRequests = { before: 0, after: 0 };
const mode = () => $('mode').value;
const assets = { before: null, after: null };
const binaries = { before: null, after: null };
const folders = { before: null, after: null };
const officeDocuments = { before: null, after: null };
const sectionRows = new Map();
const OFFICE_MODES = ['docx', 'pptx', 'xlsx'];
const LINE_MODES = ['words', 'characters', 'lines', ...OFFICE_MODES];
const TEXT_MODES = [...LINE_MODES, 'sentences', 'unordered'];
const ASSET_MODES = ['images', 'binary', 'folders'];
const options = () => ({
  language: getLanguage(),
  mode: mode(),
  sourceLanguage: $('source-language').value,
  delimiter: $('delimiter').value === 'tab' ? '\t' : $('delimiter').value,
  whitespace: TEXT_MODES.includes(mode()) && $('whitespace').checked,
  case: TEXT_MODES.includes(mode()) && $('case').checked
});
let undoState = null;
let reportSummary = '';
let disposeImageView = null;
const imageSettings = {};
const previewURLs = { before: null, after: null };
function forgetUndo() {
  undoState = null;
  $('undo').hidden = true;
}
function remember() {
  undoState = {
    before: inputs.before.value,
    after: inputs.after.value,
    names: { ...names },
    assets: { ...assets },
    binaries: { ...binaries },
    folders: { ...folders },
    officeDocuments: { ...officeDocuments },
    mode: mode(),
    delimiter: $('delimiter').value,
    sourceLanguage: $('source-language').value
  };
  $('undo').hidden = false;
}
$('undo').addEventListener('click', () => {
  if (!undoState) return;
  fileRequests.before++;
  fileRequests.after++;
  inputs.before.value = undoState.before;
  inputs.after.value = undoState.after;
  for (const key of ['before', 'after']) {
    names[key] = undoState.names[key];
    assets[key] = undoState.assets[key];
    binaries[key] = undoState.binaries[key];
    folders[key] = undoState.folders[key];
    officeDocuments[key] = undoState.officeDocuments[key];
  }
  $('mode').value = undoState.mode;
  $('delimiter').value = undoState.delimiter;
  $('source-language').value = undoState.sourceLanguage;
  forgetUndo();
  invalidate();
  syncMode();
  updateMeta();
  status(t('Vorherige Eingaben wiederhergestellt.'));
});
function comparisonStatus(message) {
  reportSummary = message;
  status(message);
}
function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
const formatDetection = { before: null, after: null };
function updateFormatTools() {
  let visible = false;
  for (const side of ['before', 'after']) {
    if (ASSET_MODES.includes(mode()) || OFFICE_MODES.includes(mode())) {
      formatDetection[side] = null;
      $('format-' + side).hidden = true;
      continue;
    }
    const source = inputs[side].value;
    if (formatDetection[side]?.source !== source)
      formatDetection[side] = { source, type: detectFormat(source) };
    const type = formatDetection[side].type;
    $('format-' + side).hidden = !type;
    if (type) {
      $('format-type-' + side).value = type;
      visible = true;
    }
  }
  document.querySelector('.format-note').hidden = !visible;
}
function updateMeta() {
  updateFormatTools();
  for (const side of ['before', 'after']) {
    const value = inputs[side].value;
    $('meta-' + side).textContent =
      `${count(lines(value).length, 'Zeile', 'Zeilen')} · ${count([...value].length, 'Zeichen')}`;
    $('name-' + side).textContent = names[side];
    $('name-' + side).title = names[side];
  }
}
function stop() {
  clearTimeout(timer);
  if (worker) worker.terminate();
  worker = null;
  $('compare').disabled = false;
  $('compare').textContent = t('Vergleichen ↗');
  $('diff').removeAttribute('aria-busy');
  if (document.activeElement === $('cancel')) $('compare').focus();
  $('cancel').hidden = true;
}
function invalidate() {
  disposeImageView?.();
  disposeImageView = null;
  request++;
  stop();
  result = null;
  reportSummary = '';
  $('export').disabled = true;
  $('export-report').disabled = true;
  $('stats').replaceChildren();
  $('navigation').hidden = true;
  $('office-navigation').hidden = true;
  sectionRows.clear();
  $('office-section').replaceChildren();
  $('report-note').hidden = true;
  anchors = [];
  current = -1;
  const placeholder = document.createElement('div');
  placeholder.className = 'empty';
  placeholder.textContent = t('Bereit zum Vergleichen.');
  $('diff').replaceChildren(placeholder);
  status(t('Eingabe geändert. Starte den Vergleich, um das Ergebnis zu aktualisieren.'));
}
for (const [side, input] of Object.entries(inputs))
  input.addEventListener('input', () => {
    fileRequests[side]++;
    forgetUndo();
    officeDocuments[side] = null;
    invalidate();
    updateMeta();
  });
for (const id of ['whitespace', 'case']) $(id).addEventListener('change', invalidate);
function validate() {
  for (const input of Object.values(inputs)) {
    if (new TextEncoder().encode(input.value).length > MAX_BYTES)
      throw new Error(t('Bitte verwende Texte bis maximal 2 MiB pro Seite.'));
    if (input.value.includes('\0'))
      throw new Error(t('Binärdaten werden nicht unterstützt. Bitte verwende eine Textdatei.'));
  }
  if (lines(inputs.before.value).length + lines(inputs.after.value).length > MAX_LINES)
    throw new Error(t('Bitte verwende insgesamt höchstens 20.000 Zeilen.'));
}
function startWorker(before, after) {
  const id = ++request;
  status(t('Vergleich wird berechnet …'));
  $('compare').disabled = true;
  $('compare').textContent = t('Vergleiche …');
  $('diff').setAttribute('aria-busy', 'true');
  $('cancel').hidden = false;
  try {
    worker = new Worker(new URL('./worker.js?v=10', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.id !== request) return;
      stop();
      if (data.error) {
        status(data.error, true);
        return;
      }
      result = data;
      current = -1;
      render();
    };
    worker.onerror = () => {
      stop();
      status(
        t(
          'Der Vergleich konnte nicht geladen werden. Öffne tinyDiff über einen Webserver (nicht als file://).'
        ),
        true
      );
    };
    worker.postMessage({ id, before, after, options: options() });
    timer = setTimeout(() => {
      request++;
      stop();
      status(t('Der Vergleich dauert zu lange. Bitte verkleinere die Eingaben.'), true);
    }, 15000);
  } catch {
    stop();
    status(
      t('Dieser Browser unterstützt den Vergleich nicht. Bitte nutze einen aktuellen Browser.'),
      true
    );
  }
}
function compare() {
  fileRequests.before++;
  fileRequests.after++;
  invalidate();
  if (['xml', 'images', 'binary', 'folders'].includes(mode())) {
    compareSpecial();
    return;
  }
  stop();
  result = null;
  $('export').disabled = true;
  $('navigation').hidden = true;
  $('stats').replaceChildren();
  try {
    validate();
  } catch (error) {
    status(error.message, true);
    return;
  }
  startWorker(inputs.before.value, inputs.after.value);
}
$('compare').addEventListener('click', compare);
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    compare();
  }
});
const exampleBefore = `# tinyDiff\n\nEin kleines Tool für klare Unterschiede.\n\nconst settings = {\n  theme: "light",\n  language: "en",\n  upload: true\n};\n\nTexte vergleichen.\nDateien hochladen.\nÄnderungen entdecken.\n`;
const exampleAfter = `# tinyDiff\n\nEin kleines Tool für den großen Überblick.\n\nconst settings = {\n  theme: "light",\n  language: "de",\n  upload: false,\n  privacy: "local"\n};\n\nTexte vergleichen.\nDateien lokal öffnen.\nÄnderungen entdecken.\nPatches exportieren.\n`;
const examples = {
  json: [
    '{"theme":"light","upload":true}',
    '{"upload":false,"theme":"dark","privacy":"local"}',
    'json'
  ],
  jsonl: [
    '{"id":1,"name":"Ada"}\n{"id":2,"active":true}\n',
    '{"name":"Ada","id":1}\n{"id":2,"active":false}\n',
    'jsonl'
  ],
  table: [
    'Name;Team;Status\nAda;Design;aktiv\nLinus;Entwicklung;aktiv\n',
    'Name;Team;Status\nAda;Design;pausiert\nLinus;Entwicklung;aktiv\nGrace;Entwicklung;aktiv\n',
    'csv'
  ],
  config: [
    '# Anwendung\nPORT=8080\n[theme]\ncolor=green\nmode=light\n',
    'PORT=8080\n[theme]\nmode=dark\ncolor=green\n',
    'ini'
  ],
  xml: [
    '<settings lang="de">\n  <theme>light</theme>\n  <upload enabled="true"/>\n</settings>',
    '<settings lang="de">\n  <theme>dark</theme>\n  <upload enabled="false"/>\n  <privacy>local</privacy>\n</settings>',
    'xml'
  ],
  sentences: [
    'Das bleibt gleich. Ein Satz wird geändert. Das ist der Schluss.',
    'Das bleibt gleich. Dieser Satz ist jetzt anders. Das ist der Schluss. Ein neuer Satz kommt hinzu.',
    'txt'
  ],
  unordered: ['Apfel\nBirne\nApfel\nKirsche\n', 'Kirsche\nApfel\nBirne\nBirne\n', 'txt']
};
const englishExamples = {
  sentences: [
    'This stays the same. One sentence changes. This is the end.',
    'This stays the same. This sentence is different. This is the end. A new sentence follows.',
    'txt'
  ],
  unordered: ['Apple\nPear\nApple\nCherry\n', 'Cherry\nApple\nPear\nPear\n', 'txt'],
  table: [
    'Name;Team;Status\nAda;Design;active\nLinus;Engineering;active\n',
    'Name;Team;Status\nAda;Design;paused\nLinus;Engineering;active\nGrace;Engineering;active\n',
    'csv'
  ],
  config: [
    '# Application\nPORT=8080\n[theme]\ncolor=green\nmode=light\n',
    'PORT=8080\n[theme]\nmode=dark\ncolor=green\n',
    'ini'
  ]
};
async function loadExample() {
  remember();
  fileRequests.before++;
  fileRequests.after++;
  if (mode() === 'ast') {
    const language = sourceLanguages[$('source-language').value];
    inputs.before.value = language.example;
    inputs.after.value = language.example.replace('price + 5', 'price * 8');
    names.before = 'before.' + language.extensions[0];
    names.after = 'after.' + language.extensions[0];
    updateMeta();
    compare();
    return;
  }
  if (mode() === 'binary') {
    binaries.before = new File(
      [new Uint8Array([0, 1, 2, 65, 66, 67, 255, 128])],
      getLanguage() === 'en' ? 'before.bin' : 'vorher.bin'
    );
    binaries.after = new File(
      [new Uint8Array([0, 1, 3, 65, 66, 67, 255, 128, 42])],
      getLanguage() === 'en' ? 'after.bin' : 'nachher.bin'
    );
    syncMode();
    compare();
    return;
  }
  if (mode() === 'images') {
    invalidate();
    const id = request;
    status(t('Demobilder werden erstellt …'));
    try {
      const [before, after] = await createImageDemo();
      if (id !== request) return;
      $('report-exif').checked = false;
      assets.before = before;
      assets.after = after;
      syncMode();
      compare();
    } catch {
      if (id === request)
        status(
          t('Die Demobilder konnten nicht erstellt werden. Bitte eigene Bilder öffnen.'),
          true
        );
    }
    return;
  }
  if (mode() === 'folders') {
    $('mode').value = 'words';
    syncMode();
  }
  const [before, after, extension] =
    (getLanguage() === 'en' ? englishExamples[mode()] : null) ||
    examples[mode()] ||
    (getLanguage() === 'en'
      ? [
          'First version.\nCompare files locally.\n',
          'Updated version.\nCompare files locally.\nExport patches.\n',
          'txt'
        ]
      : [exampleBefore, exampleAfter, 'txt']);
  officeDocuments.before = officeDocuments.after = null;
  inputs.before.value = before;
  inputs.after.value = after;
  names.before = (getLanguage() === 'en' ? 'before.' : 'vorher.') + extension;
  names.after = (getLanguage() === 'en' ? 'after.' : 'nachher.') + extension;
  if (mode() === 'table') $('delimiter').value = 'auto';
  updateMeta();
  compare();
}
$('example').addEventListener('click', loadExample);
$('empty-example').addEventListener('click', loadExample);
$('swap').addEventListener('click', () => {
  fileRequests.before++;
  fileRequests.after++;
  [inputs.before.value, inputs.after.value] = [inputs.after.value, inputs.before.value];
  [names.before, names.after] = [names.after, names.before];
  [assets.before, assets.after] = [assets.after, assets.before];
  [binaries.before, binaries.after] = [binaries.after, binaries.before];
  [folders.before, folders.after] = [folders.after, folders.before];
  [officeDocuments.before, officeDocuments.after] = [officeDocuments.after, officeDocuments.before];
  syncMode();
  invalidate();
  updateMeta();
  compare();
});
function clearInputs() {
  $('report-exif').checked = false;
  forgetUndo();
  fileRequests.before++;
  fileRequests.after++;
  officeDocuments.before = officeDocuments.after = null;
  assets.before =
    assets.after =
    binaries.before =
    binaries.after =
    folders.before =
    folders.after =
      null;
  syncMode();
  inputs.before.value = '';
  inputs.after.value = '';
  names.before = 'original.txt';
  names.after = 'modified.txt';
  invalidate();
  updateMeta();
  $('diff').replaceChildren();
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = t('Alles leer. Bereit für neue Texte.');
  $('diff').append(div);
  if (ASSET_MODES.includes(mode())) document.querySelector('[data-file="before"]').focus();
  else inputs.before.focus();
}
$('clear').addEventListener('click', () => $('clear-dialog').showModal());
$('clear-dialog').addEventListener('close', () => {
  if ($('clear-dialog').returnValue === 'clear') clearInputs();
});
async function readFile(side, file) {
  const officeType = file?.name.match(/\.(docx|pptx|xlsx)$/i)?.[1].toLowerCase();
  if (OFFICE_MODES.includes(mode()) || (officeType && !ASSET_MODES.includes(mode()))) {
    if (!file) return;
    const token = ++fileRequests[side];
    invalidate();
    status(t('Office-Datei wird gelesen …'));
    try {
      if (file.size > MAX_OFFICE_BYTES) throw new Error(t('Office: Maximal 20 MiB pro Datei.'));
      const format = officeType || mode();
      const document = await readOfficeDocument(
        await file.arrayBuffer(),
        format,
        () => fileRequests[side] === token
      );
      if (fileRequests[side] !== token) return;
      const { text } = document;
      if (
        lines(text).length + lines(inputs[side === 'before' ? 'after' : 'before'].value).length >
        MAX_LINES
      )
        throw new Error(t('Bitte verwende insgesamt höchstens 20.000 Zeilen.'));
      remember();
      inputs[side].value = text;
      officeDocuments[side] = document;
      names[side] = file.name;
      $('mode').value = format;
      invalidate();
      syncMode();
      updateMeta();
      status(t('Office-Text importiert. Verglichen wird nur der extrahierte Inhalt.'));
    } catch (error) {
      if (fileRequests[side] === token)
        status(
          error instanceof DOMException || error instanceof TypeError
            ? t('Office: Ungültiges oder nicht unterstütztes ZIP-Paket.')
            : error.message,
          true
        );
    }
    return;
  }
  if (mode() === 'binary') {
    if (!file) return;
    if (file.size > MAX_BINARY_BYTES) {
      status(t('Binärvergleich: Maximal 256 KiB pro Seite.'), true);
      return;
    }
    remember();
    binaries[side] = file;
    invalidate();
    syncMode();
    return;
  }
  if (mode() === 'images') {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
      status(t('Bitte PNG, JPEG, WebP, GIF oder BMP bis 20 MiB wählen.'), true);
      return;
    }
    remember();
    $('report-exif').checked = false;
    assets[side] = file;
    invalidate();
    syncMode();
    return;
  }
  if (mode() === 'folders') {
    status(t('Bitte Ordner über „Ordner öffnen“ auswählen.'), true);
    return;
  }
  const token = ++fileRequests[side];
  if (!file) return;
  invalidate();
  status(t('Datei wird gelesen …'));
  try {
    if (file.size > MAX_BYTES)
      throw new Error(t('Die Datei ist zu groß. Maximal 2 MiB pro Seite.'));
    const data = await file.arrayBuffer();
    if (fileRequests[side] !== token) return;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      throw new Error(
        t('Bitte öffne eine UTF-8-Textdatei. Andere Zeichenkodierungen werden nicht unterstützt.')
      );
    }
    if (text.includes('\0'))
      throw new Error(t('Diese Datei enthält Binärdaten. Bitte verwende eine Textdatei.'));
    if (lines(text).length > MAX_LINES)
      throw new Error(
        t('Diese Datei enthält zu viele Zeilen. Insgesamt sind 20.000 Zeilen möglich.')
      );
    remember();
    inputs[side].value = text;
    officeDocuments[side] = null;
    names[side] = file.name;
    if (mode() === 'ast') {
      const language = sourceLanguageForFile(file.name);
      if (language) $('source-language').value = language;
    }
    invalidate();
    updateMeta();
    status(t('{name} geöffnet. Bereit zum Vergleichen.', { name: file.name }));
  } catch (error) {
    if (fileRequests[side] === token)
      status(
        error instanceof DOMException || error instanceof TypeError
          ? t('Die Datei konnte nicht geöffnet werden.')
          : error.message || t('Die Datei konnte nicht geöffnet werden.'),
        true
      );
  }
}
for (const side of ['before', 'after']) {
  document
    .querySelector(`[data-file="${side}"]`)
    .addEventListener('click', () =>
      $((mode() === 'folders' ? 'folder-' : 'file-') + side).click()
    );
  $('file-' + side).addEventListener('change', (event) => {
    readFile(side, event.target.files[0]);
    event.target.value = '';
  });
  const zone = $('drop-' + side);
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', (event) => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove('dragging');
  });
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('dragging');
    if (event.dataTransfer.files.length !== 1) {
      status(t('Bitte genau eine Datei pro Seite ablegen.'), true);
      return;
    }
    readFile(side, event.dataTransfer.files[0]);
  });
}
// Prevent accidental navigation if a file is dropped outside an input.
document.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('Files')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  if (e.dataTransfer.types.includes('Files')) e.preventDefault();
});
function badge(text, type) {
  const el = document.createElement('span');
  el.className = 'badge ' + type;
  el.textContent = text;
  return el;
}
function td(text, className) {
  const el = document.createElement('td');
  el.dir = 'auto';
  el.className = className;
  el.textContent = text;
  return el;
}
function contentCell(raw, type, parts, side) {
  const cell = td('', 'cell ' + type + (side === 'new' && view === 'split' ? ' right' : ''));
  if (type === 'add' || type === 'remove')
    cell.setAttribute(
      'aria-label',
      (type === 'add' ? t('Hinzugefügt: ') : t('Entfernt: ')) + visible(raw)
    );
  if (raw === undefined) return cell;
  if (parts) {
    for (const part of parts) {
      if ((side === 'old' && part.type === 'add') || (side === 'new' && part.type === 'remove'))
        continue;
      const text = side === 'old' ? part.old : part.new;
      if (part.type === 'equal') cell.append(document.createTextNode(text));
      else {
        const mark = document.createElement('mark');
        mark.textContent = text;
        cell.append(mark);
      }
    }
  } else cell.append(document.createTextNode(visible(raw)));
  if (!raw.endsWith('\n')) {
    const note = document.createElement('span');
    note.className = 'eof';
    note.textContent = t('kein Zeilenumbruch');
    cell.append(note);
  }
  return cell;
}
function render() {
  if (!result) return;
  if (result.entries) {
    renderEntries(result.entries, result.label, null, result);
    return;
  }
  const ops = result.ops,
    added = ops.filter((o) => o.type === 'add').length,
    removed = ops.filter((o) => o.type === 'remove').length;
  $('stats').replaceChildren(
    badge('+' + formatNumber(added), 'added'),
    badge('−' + formatNumber(removed), 'removed')
  );
  const ignored = options().whitespace || options().case;
  $('export').disabled = OFFICE_MODES.includes(mode()) || ignored || (!added && !removed);
  $('export').title = ignored
    ? t(
        'Für einen Patch Wörter, Zeichen oder Zeilen wählen, Ignorieroptionen ausschalten und erneut vergleichen.'
      )
    : t('Unified-Diff-Datei herunterladen');
  if (OFFICE_MODES.includes(mode()))
    $('export').title = t('Office-Dateien: Kein DOCX-/PPTX-/XLSX-Patch.');
  const messages = [];
  if (OFFICE_MODES.includes(mode()))
    messages.push(t('Office-Text importiert. Verglichen wird nur der extrahierte Inhalt.'));
  if (result.approximate)
    messages.push(t('Stark unterschiedliche Texte: größere Blöcke zusammengefasst.'));
  if (ignored) messages.push(t('Ignorieroptionen aktiv. Patch-Export deaktiviert.'));
  messages.push(t('Zeilenenden als LF verglichen.'));
  comparisonStatus(
    (added || removed
      ? t('{added} hinzugefügt · {removed} entfernt.', {
          added: formatNumber(added),
          removed: formatNumber(removed)
        })
      : t(ignored ? 'Keine Unterschiede unter den gewählten Optionen.' : 'Keine Unterschiede.')) +
      ' ' +
      messages.join(' ')
  );
  const host = $('diff');
  host.replaceChildren();
  anchors = [];
  const hasOfficeSections =
    OFFICE_MODES.includes(mode()) &&
    Object.entries(officeDocuments).some(
      ([side, doc]) =>
        doc?.format === mode() && doc.text === inputs[side].value && doc.sections.length
    );
  if (!added && !removed && !hasOfficeSections) {
    const div = document.createElement('div');
    div.className = 'identical';
    const strong = document.createElement('strong');
    strong.textContent = t('✓ Alles stimmt überein.');
    const p = document.createElement('p');
    p.textContent = ignored
      ? t('Die Texte sind unter den gewählten Optionen identisch.')
      : t('Beide Versionen enthalten denselben Text.');
    div.append(strong, p);
    host.append(div);
    updateNavigation();
    return;
  }
  const table = document.createElement('table');
  table.setAttribute(
    'aria-label',
    view === 'split' ? t('Original und Änderung nebeneinander') : t('Änderungen untereinander')
  );
  const colgroup = document.createElement('colgroup');
  for (const cls of view === 'split'
    ? ['num', 'cell', 'num', 'cell']
    : ['num', 'num', 'sign', 'cell']) {
    const col = document.createElement('col');
    col.className = cls;
    colgroup.append(col);
  }
  const head = document.createElement('thead'),
    headings = document.createElement('tr');
  for (const title of view === 'split'
    ? [t('Zeile'), t('Original'), t('Zeile'), t('Änderung')]
    : [t('Originalzeile'), t('Neue Zeile'), t('Art'), t('Inhalt')]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = title;
    headings.append(th);
  }
  head.append(headings);
  const body = document.createElement('tbody');
  table.append(colgroup, head, body);
  let old = 1,
    next = 1,
    index = 0,
    highlightBudget = 300;
  const appendRow = (oldOp, newOp, parts, changed, first) => {
    const tr = document.createElement('tr');
    tr.dataset.changed = String(changed);
    if (oldOp) tr.dataset.oldLine = old;
    if (newOp) tr.dataset.newLine = next;
    if (first) {
      tr.dataset.anchor = String(anchors.length);
      anchors.push(tr);
    }
    if (!changed && $('changes-only').checked) tr.classList.add('hidden');
    if (view === 'split') {
      tr.append(
        td(oldOp ? String(old++) : '', 'num'),
        contentCell(oldOp?.old, oldOp?.type === 'remove' ? 'remove' : '', parts, 'old'),
        td(newOp ? String(next++) : '', 'num'),
        contentCell(newOp?.new, newOp?.type === 'add' ? 'add' : '', parts, 'new')
      );
    } else {
      const op = oldOp || newOp,
        type = op.type,
        isEqual = type === 'equal';
      tr.append(
        td(type !== 'add' ? String(old++) : '', 'num'),
        td(type !== 'remove' ? String(next++) : '', 'num'),
        td({ equal: ' ', remove: '−', add: '+' }[type], 'sign ' + type),
        contentCell(
          isEqual ? op.old : type === 'add' ? op.new : op.old,
          type,
          parts,
          type === 'add' ? 'new' : 'old'
        )
      );
    }
    body.append(tr);
  };
  while (index < ops.length) {
    if (ops[index].type === 'equal') {
      const o = ops[index++];
      appendRow(o, o, null, false, false);
      continue;
    }
    const deletes = [],
      inserts = [];
    while (index < ops.length && ops[index].type !== 'equal') {
      const o = ops[index++];
      (o.type === 'remove' ? deletes : inserts).push(o);
    }
    const parts = new Map();
    for (
      let i = 0;
      i < Math.min(deletes.length, inserts.length) && highlightBudget > 0;
      i++, highlightBudget--
    )
      parts.set(i, mode() === 'lines' ? null : inlineParts(deletes[i].old, inserts[i].new, mode()));
    if (view === 'split')
      for (let i = 0; i < Math.max(deletes.length, inserts.length); i++)
        appendRow(deletes[i], inserts[i], parts.get(i), true, i === 0);
    else {
      for (let i = 0; i < deletes.length; i++)
        appendRow(deletes[i], null, parts.get(i), true, i === 0);
      for (let i = 0; i < inserts.length; i++)
        appendRow(null, inserts[i], parts.get(i), true, !deletes.length && i === 0);
    }
  }
  host.append(table);
  updateOfficeNavigation(body);
  updateNavigation();
}
for (const mode of ['split', 'unified'])
  $(mode).addEventListener('click', () => {
    view = mode;
    for (const id of ['split', 'unified']) $(id).setAttribute('aria-pressed', String(id === mode));
    render();
  });
$('changes-only').addEventListener('change', () => {
  for (const row of $('diff').querySelectorAll('tr[data-changed="false"]'))
    row.classList.toggle('hidden', $('changes-only').checked && !row.dataset.section);
});
function updateOfficeNavigation(body) {
  const select = $('office-section');
  const previous = select.value;
  select.replaceChildren();
  sectionRows.clear();
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = t('Abschnitt wählen …');
  select.append(prompt);
  for (const [side, attribute, title] of [
    ['before', 'oldLine', 'Original'],
    ['after', 'newLine', 'Änderung']
  ]) {
    const documentInfo = officeDocuments[side];
    if (
      !OFFICE_MODES.includes(mode()) ||
      documentInfo?.format !== mode() ||
      documentInfo.text !== inputs[side].value
    )
      continue;
    const rows = new Map(
      [...body.rows]
        .filter((row) => row.dataset[attribute])
        .map((row) => [Number(row.dataset[attribute]), row])
    );
    const group = document.createElement('optgroup');
    group.label = t(title);
    for (const [index, section] of documentInfo.sections.entries()) {
      const row = rows.get(section.line);
      if (!row) continue;
      row.dataset.section = 'true';
      row.classList.add('office-section-row');
      row.classList.remove('hidden');
      const option = document.createElement('option');
      option.value = `${side}:${index}`;
      option.textContent =
        mode() === 'pptx'
          ? t('Folie {number}', { number: formatNumber(section.label) })
          : t('Tabellenblatt {name}', { name: section.label });
      group.append(option);
      sectionRows.set(option.value, row);
    }
    if (group.children.length) select.append(group);
  }
  if (sectionRows.has(previous)) {
    select.value = previous;
    if (current < 0) sectionRows.get(previous).classList.add('active');
  }
  $('office-navigation').hidden = !sectionRows.size;
}
$('office-section').addEventListener('change', () => {
  const row = sectionRows.get($('office-section').value);
  if (!row) return;
  for (const active of $('diff').querySelectorAll('tr.active')) active.classList.remove('active');
  current = anchors.indexOf(row);
  focusResultRow(row);
  updateNavigation();
});
function enableReport() {
  $('report-exif-option').hidden = mode() !== 'images';
  $('export-report').disabled = false;
  $('report-note').hidden = false;
}
function updateNavigation() {
  $('navigation').hidden = false;
  for (const id of ['previous', 'next']) $(id).disabled = !anchors.length;
  if (current >= anchors.length) current = -1;
  if (current >= 0) anchors[current].classList.add('active');
  $('position').textContent =
    current < 0
      ? count(anchors.length, 'Änderung', 'Änderungen')
      : t('Änderung {current} von {total}', {
          current: formatNumber(current + 1),
          total: formatNumber(anchors.length)
        });
  enableReport();
}
function navigate(direction) {
  if (!anchors.length) return;
  if (current >= 0) anchors[current]?.classList.remove('active');
  const selected = $('diff').querySelector('tr.active');
  if (current < 0 && selected) {
    const candidates = direction > 0 ? anchors : [...anchors].reverse();
    const following = candidates.find(
      (row) =>
        selected.compareDocumentPosition(row) &
        (direction > 0 ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING)
    );
    current = following ? anchors.indexOf(following) : direction > 0 ? 0 : anchors.length - 1;
  } else {
    current =
      current < 0
        ? direction > 0
          ? 0
          : anchors.length - 1
        : (current + direction + anchors.length) % anchors.length;
  }
  for (const active of $('diff').querySelectorAll('tr.active')) active.classList.remove('active');
  focusResultRow(anchors[current]);
  updateNavigation();
}
function focusResultRow(anchor) {
  anchor.classList.add('active');
  anchor.tabIndex = -1;
  anchor.focus({ preventScroll: true });
  // Scroll only the result container; keep the editor in place.
  $('diff').scrollTo({
    top:
      anchor.getBoundingClientRect().top -
      $('diff').getBoundingClientRect().top +
      $('diff').scrollTop -
      20,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
  });
}
$('previous').addEventListener('click', () => navigate(-1));
$('next').addEventListener('click', () => navigate(1));
document.addEventListener('keydown', (event) => {
  if (
    event.defaultPrevented ||
    document.querySelector('dialog[open]') ||
    event.key !== 'F7' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target.closest('input,textarea,select,[contenteditable]') ||
    !anchors.length
  )
    return;
  event.preventDefault();
  navigate(event.shiftKey ? -1 : 1);
});
$('export-report').addEventListener('click', () => {
  if ($('export-report').disabled) return;
  const settings = [
    [t('Vergleichsmodus'), $('mode').selectedOptions[0].textContent],
    [
      t('Original'),
      (mode() === 'images'
        ? assets.before?.name
        : mode() === 'binary'
          ? binaries.before?.name
          : null) || names.before
    ],
    [
      t('Änderung'),
      (mode() === 'images'
        ? assets.after?.name
        : mode() === 'binary'
          ? binaries.after?.name
          : null) || names.after
    ]
  ];
  if (mode() === 'images')
    settings.push([
      t('EXIF-Daten einschließen'),
      t($('report-exif').checked ? 'Aktiviert' : 'Deaktiviert')
    ]);
  if (mode() === 'table')
    settings.push([t('Trennzeichen'), $('delimiter').selectedOptions[0].textContent]);
  if (mode() === 'ast')
    settings.push([t('Quellcodesprache'), $('source-language').selectedOptions[0].textContent]);
  for (const control of document.querySelectorAll(
    '.options input, .image-controls input, .image-controls select'
  )) {
    if (control.closest('[hidden]')) continue;
    const key = control.getAttribute('aria-label') || control.closest('label')?.textContent;
    if (key)
      settings.push([
        key.trim(),
        control.type === 'checkbox'
          ? t(control.checked ? 'Aktiviert' : 'Deaktiviert')
          : control.selectedOptions?.[0]?.textContent || control.value
      ]);
  }
  try {
    const html = createReport({
      language: getLanguage(),
      settings,
      summary: reportSummary,
      content: $('diff'),
      includeExif: mode() === 'images' && $('report-exif').checked
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tinydiff-report.html';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    status(t('Der Bericht konnte nicht exportiert werden. Bitte verkleinere die Eingaben.'), true);
  }
});
$('export').addEventListener('click', () => {
  if (!result || $('export').disabled) return;
  const blob = new Blob([unifiedPatch(result.ops, names.before, names.after)], {
    type: 'text/x-diff;charset=utf-8'
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = 'tinydiff.patch';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme').setAttribute(
    'aria-label',
    dark ? t('Helles Design aktivieren') : t('Dunkles Design aktivieren')
  );
}
setTheme(matchMedia('(prefers-color-scheme: dark)').matches);
$('theme').addEventListener('click', () =>
  setTheme(document.documentElement.dataset.theme !== 'dark')
);
updateMeta();

const descriptions = {
  ast: 'Quellcode-Syntaxbäume vergleichen. Sprache wählen; Leerraum und Kommentare werden ignoriert. Keine Ausführung oder Typprüfung.',
  docx: 'DOCX: Dokumenttext aus dem ZIP-Paket vergleichen. Absätze und Tabellen, ohne Layout, Kopf-/Fußzeilen oder Textfelder.',
  pptx: 'PPTX: Folientext in Präsentationsreihenfolge vergleichen. Ohne Layout, Notizen oder Bildinhalte.',
  xlsx: 'XLSX: Zelladressen, Typen, gespeicherte Werte und Formeln je Blatt vergleichen. Keine Neuberechnung oder Datumsformatierung.',
  words: 'Zeilenvergleich mit präzisen Wortmarkierungen.',
  characters: 'Markiert einzelne Unicode-Zeichen innerhalb geänderter Zeilen.',
  lines: 'Vergleicht ganze Zeilen ohne zusätzliche Wortmarkierungen.',
  sentences:
    'Vergleicht vollständige Sätze einschließlich Leerraum. Die Satzgrenzen folgen der gewählten Sprache.',
  unordered:
    'Vergleicht Zeileninhalte und ihre Häufigkeit. Reihenfolge und letzter Zeilenumbruch werden ignoriert.',
  table:
    'Vergleicht CSV/TSV nach Zeile und Spalte, einschließlich zitierter mehrzeiliger Felder. Bei mehrdeutigen Daten das Trennzeichen wählen.',
  config:
    'Vergleicht INI/.env nach Abschnitt und Schlüssel. Reihenfolge und Vollzeilenkommentare werden ignoriert; Werte bleiben unverändert.',
  xml: 'Vergleicht Elemente, Attribute, Text und Element-Reihenfolge. Kommentare und Einrückung werden ignoriert; kein DOCTYPE.',
  jsonl:
    'Vergleicht einen JSON-Wert je Zeile strukturell. Datensatz-Reihenfolge bleibt relevant; innere Leerzeilen sind ungültig.',
  binary:
    'Vergleicht feste 16-Byte-Blöcke als Hex und ASCII. Einfügungen verschieben die folgenden Offsets. Maximal 256 KiB pro Seite.',
  json: 'JSON-Struktur nach Pfaden vergleichen. Objekt-Reihenfolge und Formatierung werden ignoriert; Array-Reihenfolge bleibt relevant.',
  images:
    'Pixel- und EXIF-Vergleich. Optionale Größenanpassung; bei Animationen zählt das erste Bild.',
  folders:
    'Ordner rekursiv nach relativen Pfaden und Dateiinhalt vergleichen. Leere Ordner werden nicht erfasst.'
};
const refreshModePicker = createModePicker($('mode'), $('mode-picker'), (value) =>
  t(descriptions[value])
);
function syncMode() {
  refreshModePicker();
  updateFormatTools();
  const special = ASSET_MODES.includes(mode()),
    structural = !LINE_MODES.includes(mode());
  $('example').disabled = OFFICE_MODES.includes(mode());
  $('example').title = OFFICE_MODES.includes(mode()) ? t('Bitte zwei Office-Dateien öffnen.') : '';
  $('delimiter-control').hidden = mode() !== 'table';
  $('source-language-control').hidden = mode() !== 'ast';
  $('mode-hint').textContent = t(descriptions[mode()]);
  $('back-folders').hidden = mode() === 'folders' || !folders.before || !folders.after;
  $('export').title = structural
    ? t('Patch-Export ist nur in Textmodi verfügbar.')
    : t('Unified-Diff-Datei herunterladen');
  document.querySelector('.options').hidden = !TEXT_MODES.includes(mode());
  for (const id of ['whitespace', 'case']) $(id).disabled = !TEXT_MODES.includes(mode());
  for (const id of ['split', 'unified']) $(id).disabled = structural;
  $('input-hint').textContent =
    mode() === 'binary'
      ? t(
          'Beliebige Dateien bis 256 KiB pro Seite · 16 Bytes pro Block · Ctrl / ⌘ + Enter vergleichen'
        )
      : special
        ? t(
            'Bilder: bis 20 MiB und 4 Millionen Pixel je Seite · Ordner: bis 1.000 Dateien und 100 MiB je Seite · Ctrl / ⌘ + Enter vergleichen'
          )
        : t('Textdateien bis 2 MiB und insgesamt 20.000 Zeilen · Ctrl / ⌘ + Enter vergleichen');
  if (mode() === 'ast')
    $('input-hint').textContent = t(
      'AST: Maximal 256 KiB, 10.000 Knoten und 200 Ebenen pro Seite.'
    );
  if (OFFICE_MODES.includes(mode()))
    $('input-hint').textContent = t(
      'Office: Bis 20 MiB je Datei, 8 MiB je XML-Teil, 32 MiB entpackte XML-Daten und 2 MiB Text. Der importierte Text ist schreibgeschützt.'
    );
  for (const side of ['before', 'after']) {
    inputs[side].readOnly = OFFICE_MODES.includes(mode());
    inputs[side].hidden = special;
    $('name-' + side).hidden = special;
    const panel = $('asset-' + side);
    panel.hidden = !special;
    panel.textContent =
      mode() === 'images' || mode() === 'binary'
        ? (mode() === 'binary' ? binaries[side] : assets[side])?.name ||
          (mode() === 'binary'
            ? t('Beliebige Datei über „Datei öffnen“ wählen oder hier ablegen.')
            : t('Bild über „Datei öffnen“ wählen oder hier ablegen.'))
        : folders[side]
          ? t('{count} ausgewählt', { count: count(folders[side].size, 'Datei', 'Dateien') })
          : t('Ordner über „Ordner öffnen“ auswählen.');
    if (previewURLs[side]) URL.revokeObjectURL(previewURLs[side]);
    previewURLs[side] = null;
    if (mode() === 'images' && assets[side]) {
      const image = document.createElement('img');
      image.alt = t('Vorschau: {name}', { name: assets[side].name });
      image.className = 'image-input-preview';
      image.decoding = 'async';
      image.addEventListener(
        'error',
        () => {
          if (!panel.contains(image)) return;
          image.remove();
          const error = document.createElement('p');
          error.textContent = t('Bildvorschau konnte nicht geladen werden.');
          panel.append(error);
        },
        { once: true }
      );
      image.src = previewURLs[side] = URL.createObjectURL(assets[side]);
      panel.prepend(image);
    }
    document.querySelector(`[data-file="${side}"]`).textContent =
      mode() === 'folders' ? t('Ordner öffnen ↗') : t('Datei öffnen ↗');
    $('file-' + side).accept =
      mode() === 'images'
        ? 'image/png,image/jpeg,image/webp,image/gif,image/bmp'
        : OFFICE_MODES.includes(mode())
          ? '.docx,.pptx,.xlsx'
          : '';
    $('drop-' + side).querySelector('.editor-footer').hidden = special;
  }
}
$('cancel').addEventListener('click', () => {
  invalidate();
  status(t('Vergleich abgebrochen.'));
});
$('back-folders').addEventListener('click', () => {
  $('mode').value = 'folders';
  syncMode();
  compare();
});
$('delimiter').addEventListener('change', invalidate);
$('source-language').addEventListener('change', invalidate);
$('mode').addEventListener('change', () => {
  fileRequests.before++;
  fileRequests.after++;
  invalidate();
  syncMode();
});
for (const side of ['before', 'after'])
  $('folder-' + side).addEventListener('change', (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    if (
      files.length > 1000 ||
      files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024
    ) {
      status(t('Maximal 1.000 Dateien und 100 MiB pro Ordner.'), true);
      return;
    }
    try {
      const entries = directoryEntries(files);
      remember();
      folders[side] = entries;
      invalidate();
      syncMode();
    } catch (error) {
      status(error.message, true);
    }
  });
function renderEntries(entries, label, detail, info = {}) {
  const table = document.createElement('table'),
    head = document.createElement('thead'),
    body = document.createElement('tbody');
  table.setAttribute('aria-label', t('{label} vergleichen', { label }));
  table.className = 'entry-table';
  if (mode() === 'binary') table.classList.add('hex-table');
  const colgroup = document.createElement('colgroup');
  for (const cls of ['entry-path', 'entry-status', 'entry-value', 'entry-value']) {
    const col = document.createElement('col');
    col.className = cls;
    colgroup.append(col);
  }
  table.append(colgroup);
  const heading = document.createElement('tr');
  for (const title of [label, t('Status'), t('Original'), t('Änderung')]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = title;
    heading.append(th);
  }
  head.append(heading);
  table.append(head, body);
  anchors = [];
  const labels = {
    equal: t('Identisch'),
    add: t('Hinzugefügt'),
    remove: t('Entfernt'),
    change: t('Geändert')
  };
  for (const entry of entries) {
    const row = document.createElement('tr');
    row.dataset.changed = String(entry.type !== 'equal');
    row.classList.toggle('hidden', entry.type === 'equal' && $('changes-only').checked);
    const path = td(entry.path, 'cell');
    if (detail && entry.type !== 'equal') {
      const button = document.createElement('button');
      button.className = 'text-button';
      button.textContent = entry.path;
      button.addEventListener('click', () => detail(entry));
      path.replaceChildren(button);
    }
    row.append(
      path,
      td(labels[entry.type], 'cell'),
      td(
        entry.old === '' ? t('⟨leer⟩') : (entry.old ?? '—'),
        'cell ' + (entry.type === 'equal' ? '' : 'remove')
      ),
      td(
        entry.new === '' ? t('⟨leer⟩') : (entry.new ?? '—'),
        'cell ' + (entry.type === 'equal' ? '' : 'add')
      )
    );
    body.append(row);
    if (entry.type !== 'equal') anchors.push(row);
  }
  $('diff').replaceChildren(table);
  updateNavigation();
  $('stats').replaceChildren(badge(count(anchors.length, 'Änderung', 'Änderungen'), 'added'));
  const note =
    (info.note || t('Dateiinhalte bytegenau verglichen.')) +
    (options().whitespace || options().case ? ' ' + t('Ignorieroptionen aktiv.') : '');
  const units = {
    ast: ['Knoten', 'Knoten'],
    json: ['Knoten', 'Knoten'],
    jsonl: ['Knoten', 'Knoten'],
    xml: ['Knoten', 'Knoten'],
    table: ['Zelle', 'Zellen'],
    config: ['Schlüssel', 'Schlüssel'],
    sentences: ['Satzpaar', 'Satzpaare'],
    unordered: ['verschiedene Zeile', 'verschiedene Zeilen'],
    binary: ['Block', 'Blöcke'],
    folders: ['Datei', 'Dateien']
  };
  comparisonStatus(
    count(entries.length, ...units[mode()]) +
      ' · ' +
      count(anchors.length, 'Änderung', 'Änderungen') +
      '. ' +
      note +
      (info.approximate
        ? ' ' + t('Stark unterschiedliche Texte: größere Blöcke zusammengefasst.')
        : '')
  );
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'identical';
    empty.textContent = t('Beide Eingaben sind leer. Keine Unterschiede.');
    $('diff').replaceChildren(empty);
  }
}
async function imagePixels(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      t('Das Bild konnte nicht dekodiert werden. Bitte eine unterstützte Bilddatei wählen.')
    );
  }
  try {
    if (bitmap.width * bitmap.height > 4000000)
      throw new Error(t('Bilder dürfen maximal 4 Millionen Pixel enthalten.'));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return {
      canvas,
      exif: readImageExif(await file.arrayBuffer()),
      ...{ width: bitmap.width, height: bitmap.height },
      data: context.getImageData(0, 0, bitmap.width, bitmap.height).data
    };
  } finally {
    bitmap.close();
  }
}
async function compareSpecial() {
  const id = ++request,
    selected = mode();
  $('compare').disabled = true;
  $('diff').setAttribute('aria-busy', 'true');
  $('cancel').hidden = false;
  status(t('Vergleich wird berechnet …'));
  try {
    if (selected === 'xml') {
      validate();
      renderEntries(compareXML(inputs.before.value, inputs.after.value), t('XML-Pfad'), null, {
        unit: t('Knoten'),
        note: t('Attribut-Reihenfolge, Kommentare und Einrückung zwischen Elementen ignoriert.')
      });
    }
    if (selected === 'binary') {
      if (!binaries.before || !binaries.after)
        throw new Error(t('Bitte auf beiden Seiten eine Datei auswählen.'));
      if (binaries.before.size > MAX_BINARY_BYTES || binaries.after.size > MAX_BINARY_BYTES)
        throw new Error(t('Binärvergleich: Maximal 256 KiB pro Seite.'));
      const a = await binaries.before.arrayBuffer(),
        b = await binaries.after.arrayBuffer();
      if (id !== request) return;
      startWorker(a, b);
      return;
    }
    if (selected === 'images') {
      if (!assets.before || !assets.after)
        throw new Error(t('Bitte auf beiden Seiten ein Bild auswählen.'));
      const a = await imagePixels(assets.before);
      if (id !== request) return;
      const b = await imagePixels(assets.after);
      if (id !== request) return;
      disposeImageView = createImageView(
        $('diff'),
        a,
        b,
        (summary, message) => {
          $('stats').replaceChildren(badge(summary, 'added'));
          comparisonStatus(message);
          enableReport();
        },
        (message) => {
          $('export-report').disabled = true;
          status(message, true);
        },
        imageSettings
      );
    }
    if (selected === 'folders') {
      if (!folders.before || !folders.after)
        throw new Error(t('Bitte auf beiden Seiten einen Ordner auswählen.'));
      const a = folders.before,
        b = folders.after,
        entries = [];
      for (const path of [...new Set([...a.keys(), ...b.keys()])].sort()) {
        if (id !== request) return;
        const old = a.get(path),
          next = b.get(path);
        let type = !old ? 'add' : !next ? 'remove' : 'change';
        if (old && next && old.size === next.size) {
          const left = await old.arrayBuffer(),
            right = await next.arrayBuffer();
          if (equalBytes(left, right)) type = 'equal';
        }
        entries.push({
          path,
          type,
          old: old ? formatBytes(old.size) : undefined,
          new: next ? formatBytes(next.size) : undefined
        });
      }
      if (id !== request) return;
      renderEntries(entries, t('Dateipfad'), async (entry) => {
        const token = ++request;
        try {
          const read = async (file) => {
            if (!file) return '';
            if (file.size > MAX_BYTES)
              throw new Error(t('Dateidetails sind auf 2 MiB pro Datei begrenzt.'));
            const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
            if (text.includes('\0'))
              throw new Error(t('Binärdatei: keine Textvorschau verfügbar.'));
            return text;
          };
          const before = await read(a.get(entry.path)),
            after = await read(b.get(entry.path));
          if (token !== request) return;
          remember();
          inputs.before.value = before;
          inputs.after.value = after;
          names.before = names.after = entry.path;
          $('mode').value = 'words';
          syncMode();
          updateMeta();
          compare();
        } catch (error) {
          if (token === request)
            status(
              t('Textvorschau nicht möglich: {message}', {
                message:
                  error instanceof TypeError
                    ? t(
                        'Bitte öffne eine UTF-8-Textdatei. Andere Zeichenkodierungen werden nicht unterstützt.'
                      )
                    : error.message
              }),
              true
            );
        }
      });
    }
  } catch (error) {
    if (id === request)
      status(
        error instanceof TypeError || error instanceof DOMException
          ? t('Vergleich fehlgeschlagen.')
          : error.message || t('Vergleich fehlgeschlagen.'),
        true
      );
  } finally {
    if (id === request) stop();
  }
}
syncMode();

function applyLanguage(language, initial = false) {
  const rerun =
    Boolean(result) ||
    $('diff').hasAttribute('aria-busy') ||
    Boolean($('diff').querySelector('table,.image-grid,.identical')) ||
    $('status').classList.contains('error');
  setLanguage(language);
  localizeDocument(document);
  syncMode();
  updateMeta();
  setTheme(document.documentElement.dataset.theme === 'dark');
  if (rerun) compare();
  else {
    if (!initial) invalidate();
    status(t('Bereit für deinen ersten Vergleich.'));
  }
}
$('language').addEventListener('change', (event) => applyLanguage(event.target.value));
applyLanguage($('language').value, true);

for (const button of document.querySelectorAll('[data-format-side]'))
  button.addEventListener('click', () => {
    const side = button.dataset.formatSide,
      compact = button.dataset.compact === 'true';
    try {
      if (new TextEncoder().encode(inputs[side].value).length > MAX_BYTES)
        throw new Error(t('Bitte verwende Texte bis maximal 2 MiB pro Seite.'));
      const output = ($('format-type-' + side).value === 'xml' ? formatXML : formatJSON)(
        inputs[side].value,
        compact
      );
      const other = side === 'before' ? 'after' : 'before';
      if (
        new TextEncoder().encode(output).length > MAX_BYTES ||
        lines(output).length + lines(inputs[other].value).length > MAX_LINES
      )
        throw new Error(t('Formatierung würde die Textgrenzen überschreiten.'));
      remember();
      fileRequests[side]++;
      inputs[side].value = output;
      invalidate();
      updateMeta();
      inputs[side].focus();
      status(
        t(
          compact ? 'Minifiziert. Rücknahme ist verfügbar.' : 'Formatiert. Rücknahme ist verfügbar.'
        )
      );
    } catch (error) {
      status(error.message || t('Vergleich fehlgeschlagen.'), true);
    }
  });

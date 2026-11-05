import { sourceLanguages } from './source-languages.js';
import { Parser, Language } from './vendor/tree-sitter/web-tree-sitter.js';
import { t } from './i18n.js';

const runtime = new URL('./vendor/tree-sitter/web-tree-sitter.wasm', import.meta.url);
const encoder = new TextEncoder();
const comments = new Set(['comment', 'line_comment', 'block_comment']);
const limit = () => new Error(t('AST: Maximal 256 KiB, 10.000 Knoten und 200 Ebenen pro Seite.'));
async function localBytes(name) {
  const response = await fetch(name === 'runtime' ? runtime : sourceLanguages[name].grammar);
  if (!response.ok) throw new Error('parser-asset');
  return new Uint8Array(await response.arrayBuffer());
}

// Injecting the byte loader lets Node tests exercise the same vendored Wasm as the worker.
export function createSourceComparator(loadBytes = localBytes) {
  let initialized;
  const languages = new Map();
  async function language(name) {
    if (!Object.hasOwn(sourceLanguages, name))
      throw new Error(t('AST: Bitte eine unterstützte Quellcodesprache wählen.'));
    try {
      initialized ??= loadBytes('runtime').then((wasmBinary) =>
        Parser.init({ wasmBinary, printErr() {} })
      );
      await initialized;
      if (!languages.has(name)) languages.set(name, Language.load(await loadBytes(name)));
      return await languages.get(name);
    } catch {
      throw new Error(
        t(
          'AST: Lokale Parser konnten nicht geladen werden. Bitte Seite neu laden und WebAssembly-Unterstützung prüfen.'
        )
      );
    }
  }
  function syntaxTree(source, grammar, name, side) {
    if (encoder.encode(source).length > 256 * 1024) throw limit();
    const parser = new Parser();
    let tree;
    try {
      parser.setLanguage(grammar);
      const deadline = performance.now() + 1500;
      tree = parser.parse(source, null, { progressCallback: () => performance.now() > deadline });
      if (!tree) throw limit();
      const values = new Map();
      const pending = [[tree.rootNode, '/', 0]];
      let nodes = 0,
        outputBytes = 0;
      while (pending.length) {
        const [node, path, depth] = pending.pop();
        if (++nodes > 10000 || depth > 200) throw limit();
        if (node.isError || node.isMissing) {
          throw new Error(
            t('AST ({language}), {side}, Zeile {line}, Spalte {column}: Syntaxfehler.', {
              language: sourceLanguages[name].name,
              side: t(side),
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1
            })
          );
        }
        if (comments.has(node.type)) continue;
        // Include anonymous tokens: dropping them would hide operator and keyword changes.
        if (nodes + pending.length + node.childCount > 10000) throw limit();
        const children = node.children.filter((child) => !comments.has(child.type));
        const value = children.length ? node.type : `${node.type}: ${JSON.stringify(node.text)}`;
        outputBytes += encoder.encode(path).length + encoder.encode(value).length;
        if (outputBytes > 2 * 1024 * 1024)
          throw new Error(t('AST: Syntaxbaum-Ausgabe überschreitet 2 MiB pro Seite.'));
        values.set(path, value);
        for (let i = children.length - 1; i >= 0; i--) {
          const child = children[i];
          pending.push([child, `${path}${node.type}[${i}]/`, depth + 1]);
        }
      }
      return values;
    } finally {
      tree?.delete();
      parser.delete();
    }
  }
  return async (before, after, options = {}) => {
    const name = options.sourceLanguage || 'python';
    // Reject oversized input before loading/initializing the parser.
    if ([before, after].some((source) => encoder.encode(source).length > 256 * 1024)) throw limit();
    const grammar = await language(name);
    const a = syntaxTree(before, grammar, name, 'Original');
    const b = syntaxTree(after, grammar, name, 'Änderung');
    const paths = [...new Set([...a.keys(), ...b.keys()])];
    if (paths.length > 20000) throw limit();
    return {
      entries: paths.map((path) => ({
        path,
        old: a.get(path),
        new: b.get(path),
        type: !a.has(path)
          ? 'add'
          : !b.has(path)
            ? 'remove'
            : a.get(path) === b.get(path)
              ? 'equal'
              : 'change'
      })),
      label: t('Syntaxpfad'),
      unit: t('Knoten'),
      note: t(
        'Syntaxbaum verglichen: Leerraum und Kommentare ignoriert. Reihenfolge, Operatoren und Literale bleiben relevant. Keine Ausführung oder Typprüfung.'
      )
    };
  };
}
export const compareSource = createSourceComparator();

import { getLanguage, getLocale, t } from './i18n.js';
export const formatNumber = (value) => new Intl.NumberFormat(getLocale()).format(value);
const englishNouns = {
  Pixel: ['pixel', 'pixels'],
  Zeile: ['line', 'lines'],
  Zeichen: ['character', 'characters'],
  Änderung: ['change', 'changes'],
  Änderungsblock: ['change block', 'change blocks'],
  Datei: ['file', 'files'],
  Block: ['block', 'blocks'],
  Zelle: ['cell', 'cells'],
  Satzpaar: ['sentence pair', 'sentence pairs'],
  Knoten: ['node', 'nodes'],
  Schlüssel: ['key', 'keys'],
  'verschiedene Zeile': ['distinct line', 'distinct lines']
};
const nouns = {
  en: englishNouns,
  it: {
    Pixel: ['pixel', 'pixel'],
    Zeile: ['riga', 'righe'],
    Zeichen: ['carattere', 'caratteri'],
    Änderung: ['modifica', 'modifiche'],
    Änderungsblock: ['blocco di modifiche', 'blocchi di modifiche'],
    Datei: ['file', 'file'],
    Block: ['blocco', 'blocchi'],
    Zelle: ['cella', 'celle'],
    Satzpaar: ['coppia di frasi', 'coppie di frasi'],
    Knoten: ['nodo', 'nodi'],
    Schlüssel: ['chiave', 'chiavi'],
    'verschiedene Zeile': ['riga distinta', 'righe distinte']
  },
  es: {
    Pixel: ['píxel', 'píxeles'],
    Zeile: ['línea', 'líneas'],
    Zeichen: ['carácter', 'caracteres'],
    Änderung: ['cambio', 'cambios'],
    Änderungsblock: ['bloque de cambios', 'bloques de cambios'],
    Datei: ['archivo', 'archivos'],
    Block: ['bloque', 'bloques'],
    Zelle: ['celda', 'celdas'],
    Satzpaar: ['par de frases', 'pares de frases'],
    Knoten: ['nodo', 'nodos'],
    Schlüssel: ['clave', 'claves'],
    'verschiedene Zeile': ['línea distinta', 'líneas distintas']
  },
  fr: {
    Pixel: ['pixel', 'pixels'],
    Zeile: ['ligne', 'lignes'],
    Zeichen: ['caractère', 'caractères'],
    Änderung: ['modification', 'modifications'],
    Änderungsblock: ['bloc de modifications', 'blocs de modifications'],
    Datei: ['fichier', 'fichiers'],
    Block: ['bloc', 'blocs'],
    Zelle: ['cellule', 'cellules'],
    Satzpaar: ['paire de phrases', 'paires de phrases'],
    Knoten: ['nœud', 'nœuds'],
    Schlüssel: ['clé', 'clés'],
    'verschiedene Zeile': ['ligne distincte', 'lignes distinctes']
  }
};
export function count(value, one, other = one) {
  const singular = new Intl.PluralRules(getLocale()).select(value) === 'one';
  const word = nouns[getLanguage()]?.[one]
    ? nouns[getLanguage()][one][singular ? 0 : 1]
    : t(singular ? one : other);
  return `${formatNumber(value)} ${word}`;
}
export const formatBytes = (value) =>
  new Intl.NumberFormat(getLocale(), { style: 'unit', unit: 'byte', unitDisplay: 'short' }).format(
    value
  );

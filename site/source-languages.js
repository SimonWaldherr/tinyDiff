// Keep grammar assets, file extensions and examples together.
export const sourceLanguages = {
  python: {
    name: 'Python',
    extensions: ['py'],
    grammar: new URL('./vendor/tree-sitter/tree-sitter-python.wasm', import.meta.url),
    example: 'def total(price):\n    return price + 5\n'
  },
  go: {
    name: 'Go',
    extensions: ['go'],
    grammar: new URL('./vendor/tree-sitter/tree-sitter-go.wasm', import.meta.url),
    example: 'package main\n\nfunc total(price int) int {\n\treturn price + 5\n}\n'
  },
  c: {
    name: 'C',
    extensions: ['c', 'h'],
    grammar: new URL('./vendor/tree-sitter/tree-sitter-c.wasm', import.meta.url),
    example: 'int total(int price) {\n    return price + 5;\n}\n'
  },
  cpp: {
    name: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx', 'hh'],
    grammar: new URL('./vendor/tree-sitter/tree-sitter-cpp.wasm', import.meta.url),
    example: 'auto total(int price) -> int {\n    return price + 5;\n}\n'
  },
  rust: {
    name: 'Rust',
    extensions: ['rs'],
    grammar: new URL('./vendor/tree-sitter/tree-sitter-rust.wasm', import.meta.url),
    example: 'fn total(price: i32) -> i32 {\n    price + 5\n}\n'
  },
  javascript: {
    name: 'JavaScript',
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    grammar: new URL('./vendor/tree-sitter/tree-sitter-javascript.wasm', import.meta.url),
    example: 'export function total(price) {\n    return price + 5;\n}\n'
  },
  typescript: {
    name: 'TypeScript',
    extensions: ['ts', 'mts', 'cts'],
    grammar: new URL('./vendor/tree-sitter/tree-sitter-typescript.wasm', import.meta.url),
    example: 'export function total(price: number): number {\n    return price + 5;\n}\n'
  }
};
export function sourceLanguageForFile(filename) {
  if (!filename.includes('.')) return undefined;
  const extension = filename.split('.').at(-1).toLowerCase();
  return Object.keys(sourceLanguages).find((name) =>
    sourceLanguages[name].extensions.includes(extension)
  );
}

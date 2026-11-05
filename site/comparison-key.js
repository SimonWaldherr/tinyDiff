export function comparisonKey(text, options = {}) {
  let key = options.whitespace ? text.replace(/\s+/gu, '') : text;
  return options.case ? key.toLowerCase() : key;
}

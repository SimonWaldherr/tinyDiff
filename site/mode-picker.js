import { t } from './i18n.js';
const searchable = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function matchesMode(query, ...values) {
  const text = searchable(values.join(' '));
  return searchable(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
// The native select remains the source of truth and compact keyboard alternative.
export function createModePicker(select, host, describe) {
  let category = '';
  const searchLabel = document.createElement('label');
  const searchTitle = document.createElement('span');
  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'mode-search';
  searchLabel.htmlFor = search.id;
  searchLabel.append(searchTitle, search);
  const filters = document.createElement('div');
  filters.className = 'mode-filters';
  filters.setAttribute('role', 'group');
  const grid = document.createElement('fieldset');
  grid.className = 'mode-grid';
  const legend = document.createElement('legend');
  legend.className = 'sr-only';
  const empty = document.createElement('p');
  empty.className = 'mode-empty';
  empty.setAttribute('role', 'status');
  host.append(searchLabel, filters, grid, empty);
  const groups = [...select.querySelectorAll('optgroup')];
  const filterButtons = ['', ...groups.map((group) => group.dataset.i18nLabel || group.label)].map(
    (key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', () => {
        category = key;
        refresh();
      });
      filters.append(button);
      return { key, button };
    }
  );
  function refresh() {
    searchTitle.textContent = t('Modus suchen');
    search.placeholder = t('Name, Format oder Funktion …');
    filters.setAttribute('aria-label', t('Moduskategorien'));
    for (const { key, button } of filterButtons) {
      button.textContent = t(key || 'Alle');
      button.setAttribute('aria-pressed', String(key === category));
    }
    legend.textContent = t('Vergleichsmodus');
    grid.replaceChildren(legend);
    let found = 0;
    for (const group of groups)
      for (const option of group.children) {
        const key = option.dataset.i18n || option.textContent;
        const description = describe(option.value);
        if (category && category !== (group.dataset.i18nLabel || group.label)) continue;
        if (!matchesMode(search.value, key, t(key), option.value, description)) continue;
        found++;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'mode-card';
        card.setAttribute('aria-pressed', String(select.value === option.value));
        const title = document.createElement('strong');
        const hint = document.createElement('span');
        title.textContent = t(key);
        hint.textContent = description;
        card.append(title, hint);
        grid.append(card);
        card.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          host.closest('details').open = false;
          select.focus();
        });
      }
    empty.hidden = found !== 0;
    empty.textContent = t('Keine passenden Modi. Suche oder Kategorie ändern.');
  }
  search.addEventListener('input', refresh);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      search.value = '';
      category = '';
      refresh();
    }
  });
  refresh();
  return refresh;
}

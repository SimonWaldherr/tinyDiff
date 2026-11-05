import { loadTestApp, waitForDOM } from './browser-helpers.js';
import { readOfficeDocument } from '../site/office.js';
import { makeZip, pptxParts, xlsxParts } from './office-fixtures.js';

export async function testOfficeNavigation() {
  const results = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  try {
    const parts = { ...pptxParts };
    parts['ppt/slides/slide2.xml'] = parts['ppt/slides/slide2.xml'].replace(
      'Second file',
      'Second file\n[slide:99]'
    );
    const data = await readOfficeDocument(makeZip(parts), 'pptx');
    assert(data.sections.length === 2, 'Text marker created a section');
    assert(
      data.sections[0].label === 1 && data.sections[1].label === 2,
      'Presentation order changed'
    );
    assert(
      data.text.split('\n')[data.sections[1].line - 1] === '[slide:2]',
      'Section line offset incorrect'
    );
    const sheets = await readOfficeDocument(makeZip(xlsxParts), 'xlsx');
    assert(
      sheets.sections[0].label === 'Report' && sheets.sections[0].line === 1,
      'Sheet name or position lost'
    );
    results.push('PASS Office section metadata uses package structure and preserves text offsets');
  } catch (error) {
    results.push('FAIL Office section metadata: ' + error.message);
  }

  const frame = document.createElement('iframe');
  frame.title = 'Office navigation regression';
  document.body.append(frame);
  try {
    const doc = await loadTestApp(frame);
    const wait = (predicate) => waitForDOM(doc, predicate);
    const importFile = async (side, parts, format) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([makeZip(parts)], side + '.' + format));
      const input = doc.getElementById('file-' + side);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
      await wait(() => doc.getElementById('name-' + side).textContent === side + '.' + format);
    };
    await importFile('before', pptxParts, 'pptx');
    const modified = {
      ...pptxParts,
      'ppt/slides/slide1.xml': pptxParts['ppt/slides/slide1.xml'].replace(
        'First file',
        'Updated first file'
      )
    };
    await importFile('after', modified, 'pptx');
    doc.getElementById('compare').click();
    await wait(() => !doc.getElementById('export-report').disabled);
    const select = doc.getElementById('office-section');
    assert(select.options.length === 5, 'Both slides on both sides must be selectable');
    doc.getElementById('changes-only').click();
    select.value = 'after:1';
    select.dispatchEvent(new Event('change'));
    assert(doc.activeElement.textContent.includes('[slide:2]'), 'Jump selected wrong slide');
    assert(
      !doc.activeElement.classList.contains('hidden'),
      'Unchanged section heading hidden by filter'
    );
    doc.getElementById('unified').click();
    assert(
      select.value === 'after:1' &&
        doc.querySelector('tr.active')?.textContent.includes('[slide:2]'),
      'View change reset section selection'
    );
    select.value = 'before:0';
    select.dispatchEvent(new Event('change'));
    assert(doc.activeElement.textContent.includes('[slide:1]'), 'Unified jump failed');
    doc.getElementById('swap').click();
    await wait(() => !doc.getElementById('export-report').disabled);
    assert(select.options.length === 5, 'Swap lost section metadata');
    await importFile('before', xlsxParts, 'xlsx');
    await importFile('after', xlsxParts, 'xlsx');
    doc.getElementById('compare').click();
    await wait(() => !doc.getElementById('export-report').disabled);
    assert(
      select.options.length === 3 && select.options[1].textContent.includes('Report'),
      'Identical workbook has no sheet navigation'
    );
    assert(doc.getElementById('next').disabled, 'Identical workbook has changes');
    doc.getElementById('undo').click();
    assert(doc.getElementById('office-navigation').hidden, 'Undo retained stale navigation');
    const mode = doc.getElementById('mode');
    mode.value = 'words';
    mode.dispatchEvent(new Event('change'));
    doc.getElementById('before').value = '[slide:1]\nUntrusted text';
    doc.getElementById('before').dispatchEvent(new Event('input'));
    doc.getElementById('compare').click();
    await wait(() => !doc.getElementById('export-report').disabled);
    assert(doc.getElementById('office-navigation').hidden, 'Plain text gained Office navigation');
    results.push(
      'PASS Office section jumps, filtering, views, swap, identical sheets and stale metadata'
    );
  } catch (error) {
    results.push('FAIL Office navigation: ' + error.message);
  } finally {
    frame.remove();
  }
  return results;
}

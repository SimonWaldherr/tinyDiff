import { loadTestApp, waitForDOM } from './browser-helpers.js';
import { createReport } from '../site/report.js';
import { setLanguage } from '../site/i18n.js';

export async function testReports() {
  const results = [];
  const test = async (name, run) => {
    try {
      await run();
      results.push('PASS ' + name);
    } catch (error) {
      results.push('FAIL ' + name + ': ' + error.message);
    }
  };
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  await test('HTML report escapes content, strips active markup and keeps filtered rows', () => {
    setLanguage('en');
    const content = document.createElement('div');
    const table = content.appendChild(document.createElement('table'));
    const row = table.insertRow();
    row.className = 'hidden active';
    row.hidden = true;
    row.insertCell().textContent = '<script>alert("hello")</script> & ü 🐟';
    const script = content.appendChild(document.createElement('script'));
    script.textContent = 'alert(1)';
    row.setAttribute('onclick', 'alert(1)');
    const report = createReport({
      language: 'en',
      settings: [['Original', '<img src=x onerror=alert(1)>']],
      summary: 'test',
      content
    });
    const parsed = new DOMParser().parseFromString(report, 'text/html');
    assert(!parsed.querySelector('script,[onclick],[onerror],iframe'), 'Active content retained');
    assert(
      parsed.querySelector('td').textContent === row.cells[0].textContent,
      'Unicode or literal content changed'
    );
    assert(
      !parsed.querySelector('tr').hidden &&
        !parsed.querySelector('tr').classList.contains('hidden'),
      'Filtered row missing'
    );
    assert(
      parsed.querySelector('dd').textContent === '<img src=x onerror=alert(1)>',
      'Filename interpreted as markup'
    );
    assert(
      parsed.querySelector('meta[http-equiv]').content.includes("default-src 'none'"),
      'Missing offline CSP'
    );
  });
  await test('HTML report embeds PNG pixels and includes collapsed EXIF', async () => {
    const content = document.createElement('div');
    const canvas = content.appendChild(document.createElement('canvas'));
    canvas.width = canvas.height = 2;
    canvas.setAttribute('aria-label', 'Original');
    canvas.getContext('2d').fillRect(0, 0, 2, 2);
    const details = content.appendChild(document.createElement('details'));
    details.className = 'image-metadata';
    details.appendChild(document.createElement('summary')).textContent = 'EXIF';
    details.appendChild(document.createElement('p')).textContent = 'GPS public demo';
    const parsed = new DOMParser().parseFromString(
      createReport({ language: 'en', settings: [], summary: '', content, includeExif: true }),
      'text/html'
    );
    const privateReport = createReport({ language: 'en', settings: [], summary: '', content });
    assert(
      !privateReport.includes('GPS public demo') && !privateReport.includes('<details'),
      'EXIF leaked without opt-in'
    );
    const img = parsed.querySelector('img');
    assert(img.src.startsWith('data:image/png;base64,'), 'PNG not embedded');
    assert(parsed.querySelector('details').open, 'EXIF remains collapsed');
    const loaded = new Image();
    loaded.src = img.src;
    await loaded.decode();
    assert(loaded.naturalWidth === 2, 'Embedded PNG does not decode');
  });
  await test('HTML report enforces the UTF-8 byte budget before processing more content', () => {
    const content = document.createElement('div');
    content.textContent = 'ä 🐟';
    const options = { language: 'en', settings: [], summary: '', content };
    const expected = createReport(options);
    const bytes = new TextEncoder().encode(expected).byteLength;
    assert(
      createReport({ ...options, maxBytes: bytes }) === expected,
      'Exact byte budget rejected'
    );
    let limited = false;
    try {
      createReport({ ...options, maxBytes: bytes - 1 });
    } catch (error) {
      limited = error instanceof RangeError;
    }
    assert(limited, 'UTF-8 byte limit ignored');
    content.textContent = 'x'.repeat(8000);
    let touched = false;
    const canvas = content.appendChild(document.createElement('canvas'));
    canvas.toDataURL = () => {
      touched = true;
      throw new Error('Late canvas serialization');
    };
    try {
      createReport({ ...options, maxBytes: 4096 });
    } catch (error) {
      assert(error instanceof RangeError, 'Serialization continued beyond budget');
    }
    assert(!touched, 'Later image encoded after exceeding budget');
  });
  setLanguage('de');
  await test('App navigation, keyboard, filters and report invalidation', async () => {
    const frame = document.createElement('iframe');
    frame.title = 'Navigation regression';
    document.body.append(frame);
    try {
      const doc = await loadTestApp(frame);
      const wait = (predicate) => waitForDOM(doc, predicate);
      doc.getElementById('example').click();
      await wait(() => !doc.getElementById('export-report').disabled);
      doc.getElementById('next').click();
      const first = doc.querySelector('tr.active');
      assert(first && doc.activeElement === first, 'Navigation does not focus row');
      const counter = doc.getElementById('position').textContent;
      doc.getElementById('clear').click();
      const dialogKey = new frame.contentWindow.KeyboardEvent('keydown', {
        key: 'F7',
        bubbles: true,
        cancelable: true
      });
      doc.activeElement.dispatchEvent(dialogKey);
      assert(
        !dialogKey.defaultPrevented && doc.getElementById('position').textContent === counter,
        'F7 navigated behind a modal dialog'
      );
      const compareKey = new frame.contentWindow.KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      doc.activeElement.dispatchEvent(compareKey);
      assert(
        !compareKey.defaultPrevented && !doc.getElementById('export-report').disabled,
        'Comparison started behind a modal dialog'
      );
      doc.getElementById('clear-dialog').close();
      const summary = doc.getElementById('status').textContent;
      const win = frame.contentWindow;
      const createURL = win.URL.createObjectURL;
      const click = win.HTMLAnchorElement.prototype.click;
      let exported;
      try {
        win.URL.createObjectURL = () => {
          throw new Error('Simulated download failure');
        };
        doc.getElementById('export-report').click();
        assert(
          doc.getElementById('status').classList.contains('error'),
          'Download failure not reported'
        );
        win.URL.createObjectURL = (blob) => {
          exported = blob;
          return createURL.call(win.URL, blob);
        };
        win.HTMLAnchorElement.prototype.click = () => {};
        doc.getElementById('export-report').click();
      } finally {
        win.URL.createObjectURL = createURL;
        win.HTMLAnchorElement.prototype.click = click;
      }
      const report = new DOMParser().parseFromString(await exported.text(), 'text/html');
      assert(
        [...report.querySelectorAll('p')].some((p) => p.textContent === summary),
        'Retry exported a failure message instead of the comparison summary'
      );
      doc.getElementById('unified').click();
      assert(
        doc.querySelector('tr.active') && doc.getElementById('position').textContent === counter,
        'View switch loses selection'
      );
      doc.activeElement.dispatchEvent(
        new frame.contentWindow.KeyboardEvent('keydown', { key: 'F7', bubbles: true })
      );
      assert(doc.getElementById('position').textContent !== counter, 'F7 did not advance');
      const mode = doc.getElementById('mode');
      mode.value = 'json';
      mode.dispatchEvent(new Event('change'));
      doc.getElementById('example').click();
      await wait(() => !doc.getElementById('export-report').disabled);
      doc.getElementById('changes-only').click();
      assert(
        [...doc.querySelectorAll('tr[data-changed="false"]')].every((row) =>
          row.classList.contains('hidden')
        ),
        'Filter failed'
      );
      doc.getElementById('next').click();
      assert(doc.querySelector('tr.active'), 'Structured navigation failed');
      const before = doc.getElementById('before');
      before.value = '{}';
      before.dispatchEvent(new Event('input', { bubbles: true }));
      assert(doc.getElementById('export-report').disabled, 'Stale report remains exportable');
      doc.getElementById('after').value = '{}';
      doc.getElementById('compare').click();
      await wait(() => !doc.getElementById('export-report').disabled);
      assert(
        doc.getElementById('next').disabled && doc.getElementById('previous').disabled,
        'Empty navigation enabled'
      );
      mode.value = 'images';
      mode.dispatchEvent(new Event('change'));
      doc.getElementById('example').click();
      await wait(() => !doc.getElementById('export-report').disabled);
      const exif = doc.getElementById('report-exif');
      assert(
        !exif.checked && !doc.getElementById('report-exif-option').hidden,
        'EXIF export must be opt-in'
      );
      exif.click();
      assert(exif.checked, 'Cannot opt into EXIF export');
      doc.getElementById('example').click();
      await wait(() => !doc.getElementById('export-report').disabled);
      assert(!exif.checked, 'Replacing images retained metadata disclosure');
    } finally {
      frame.remove();
    }
  });
  return results;
}

import { imageSizePlan } from './image-sizing.js';
import { createExifView } from './exif-view.js';
import { swipeGeometry } from './image-geometry.js';
import { pixelDiff } from './modes.js';
import { t, getLocale } from './i18n.js';
import { count, formatNumber } from './format.js';

export function createImageView(host, sourceA, sourceB, onSummary, onError, settings = {}) {
  let a = sourceA,
    b = sourceB,
    width = 1,
    height = 1;
  let prepared = null,
    valid = false;
  let active = true;
  const root = document.createElement('section');
  root.className = 'image-comparison';
  const controls = document.createElement('div');
  controls.className = 'image-controls';
  const select = document.createElement('select');
  for (const [value, key] of [
    ['overview', 'Übersicht'],
    ['difference', 'Differenzbild'],
    ['overlay', 'Überlagerung'],
    ['swipe', 'Wischvergleich']
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.append(option);
  }
  function label(key, control) {
    if (control.matches('select,input')) control.setAttribute('aria-label', t(key));
    const element = document.createElement('label');
    element.append(document.createTextNode(t(key)), control);
    controls.append(element);
  }
  select.value = settings.view || 'overview';
  label('Bildansicht', select);
  const sizing = document.createElement('select');
  for (const [value, key] of [
    ['none', 'Originalgrößen'],
    ['before', 'Auf Originalgröße einpassen'],
    ['after', 'Auf Änderungsgröße einpassen']
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    sizing.append(option);
  }
  sizing.value = settings.sizing || 'none';
  label('Größenanpassung', sizing);
  function slider(key, max, value, min = 0) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.value = value;
    const output = document.createElement('output');
    const wrapper = document.createElement('span');
    wrapper.className = 'image-slider';
    wrapper.append(input, output);
    // Keep the control's accessible name independent of its output value.
    input.setAttribute('aria-label', t(key));
    label(key, wrapper);
    const update = () => {
      output.value = formatNumber(Number(input.value));
    };
    input.addEventListener('input', update);
    update();
    return input;
  }
  const tolerance = slider('Pixeltoleranz (0–255)', 255, settings.tolerance ?? 0);
  const blend = slider('Position / Überblendung (%)', 100, settings.blend ?? 50);
  const angle = slider('Winkel der Trennlinie (°)', 180, settings.angle ?? 0, -180);
  const alpha = document.createElement('input');
  alpha.type = 'checkbox';
  alpha.checked = settings.ignoreAlpha ?? false;
  label('Alpha-Kanal ignorieren', alpha);
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'secondary';
  download.textContent = t('Differenz als PNG');
  controls.append(download);
  const note = document.createElement('p');
  note.className = 'image-note';
  note.textContent = t(
    'Toleranz gilt pro Farbkanal. Größenunterschiede bleiben sichtbar. Alle Ansichten sind oben links ausgerichtet, ohne Skalierung der Quelldaten.'
  );
  const grid = document.createElement('div');
  grid.className = 'image-grid';
  const difference = document.createElement('canvas');
  difference.width = width;
  difference.height = height;
  const stage = document.createElement('canvas');
  stage.width = width;
  stage.height = height;
  const stageHost = document.createElement('div');
  stageHost.className = 'image-stage';
  stageHost.append(stage);
  function updateFigures() {
    grid.replaceChildren();
    for (const [key, canvas] of [
      ['Original', a.canvas],
      ['Änderung', b.canvas],
      ['Differenz · pink = geändert', difference]
    ]) {
      const figure = document.createElement('figure'),
        caption = document.createElement('figcaption');
      caption.textContent = `${t(key)} · ${formatNumber(canvas.width)} × ${formatNumber(canvas.height)}`;
      canvas.setAttribute('aria-label', caption.textContent);
      figure.append(caption, canvas);
      grid.append(figure);
    }
  }
  const swipeHelp = document.createElement('p');
  swipeHelp.className = 'image-note';
  swipeHelp.dataset.reportOmit = 'true';
  swipeHelp.textContent = t(
    'Trennlinie im Bild ziehen. Pfeiltasten verschieben sie, Umschalt beschleunigt; Pos1 und Ende zeigen jeweils ein ganzes Bild. Der Winkel ändert nur die Ansicht.'
  );
  root.append(
    controls,
    note,
    swipeHelp,
    grid,
    stageHost,
    createExifView(sourceA.exif, sourceB.exif)
  );
  host.replaceChildren(root);
  function draw() {
    const view = select.value;
    Object.assign(settings, {
      view,
      tolerance: Number(tolerance.value),
      blend: Number(blend.value),
      angle: Number(angle.value),
      ignoreAlpha: alpha.checked
    });
    grid.hidden = !valid || view !== 'overview';
    stageHost.hidden = !valid || view === 'overview';
    blend.closest('label').hidden = view !== 'overlay' && view !== 'swipe';
    angle.closest('label').hidden = view !== 'swipe';
    swipeHelp.hidden = view !== 'swipe';
    stage.classList.toggle('image-swipe', view === 'swipe');
    stage.tabIndex = view === 'swipe' ? 0 : -1;
    stage.setAttribute('role', view === 'swipe' ? 'slider' : 'img');
    for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'])
      stage.removeAttribute(name);
    if (view === 'swipe') {
      stage.setAttribute('aria-valuemin', '0');
      stage.setAttribute('aria-valuemax', '100');
      stage.setAttribute('aria-valuenow', blend.value);
      stage.setAttribute(
        'aria-valuetext',
        t('{position} Prozent, Winkel {angle} Grad', {
          position: formatNumber(Number(blend.value)),
          angle: formatNumber(Number(angle.value))
        })
      );
    }
    if (!valid || view === 'overview') return;
    const context = stage.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.save();
    if (view === 'difference') context.drawImage(difference, 0, 0);
    else if (view === 'overlay') {
      const fraction = Number(blend.value) / 100;
      context.globalAlpha = 1 - fraction;
      context.drawImage(a.canvas, 0, 0);
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = fraction;
      context.drawImage(b.canvas, 0, 0);
    } else {
      const geometry = swipeGeometry(width, height, Number(blend.value) / 100, Number(angle.value));
      context.drawImage(a.canvas, 0, 0);
      context.beginPath();
      for (const [index, point] of geometry.polygon.entries())
        context[index ? 'lineTo' : 'moveTo'](...point);
      context.closePath();
      context.clip();
      context.clearRect(0, 0, width, height);
      context.drawImage(b.canvas, 0, 0);
      context.restore();
      context.save();
      // Keep the line and handle usable even when a large image is scaled down.
      const scale = width / (stage.clientWidth || width);
      if (geometry.line.length === 2) {
        const [start, end] = geometry.line;
        context.beginPath();
        context.moveTo(...start);
        context.lineTo(...end);
        context.strokeStyle = '#fff';
        context.lineWidth = 5 * scale;
        context.stroke();
        context.strokeStyle = '#087f68';
        context.lineWidth = 2 * scale;
        context.stroke();
        context.beginPath();
        context.arc((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, 15 * scale, 0, Math.PI * 2);
        context.fillStyle = '#087f68';
        context.fill();
        context.strokeStyle = '#fff';
        context.stroke();
        context.beginPath();
        const cx = (start[0] + end[0]) / 2,
          cy = (start[1] + end[1]) / 2;
        for (const offset of [-4, 4]) {
          context.moveTo(cx + offset * scale, cy - 5 * scale);
          context.lineTo(cx + offset * scale, cy + 5 * scale);
        }
        context.stroke();
      }
    }
    context.restore();
    const names = { difference: 'Differenzbild', overlay: 'Überlagerung', swipe: 'Wischvergleich' };
    stage.setAttribute(
      'aria-label',
      view === 'swipe' ? t('Position der Trennlinie') : t(names[view])
    );
  }
  function compare() {
    if (prepared !== sizing.value) {
      const plan = imageSizePlan(sourceA, sourceB, sizing.value);
      if (plan.width * plan.height > 8000000) {
        valid = false;
        download.disabled = true;
        draw();
        onError(t('Die gemeinsame Bildfläche ist zu groß (maximal 8 Millionen Pixel).'));
        return;
      }
      function resize(source, box) {
        if (
          sizing.value === 'none' ||
          (source.width === plan.width && source.height === plan.height)
        )
          return source;
        const canvas = document.createElement('canvas');
        canvas.width = plan.width;
        canvas.height = plan.height;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(source.canvas, box.x, box.y, box.width, box.height);
        return {
          canvas,
          width: canvas.width,
          height: canvas.height,
          data: context.getImageData(0, 0, canvas.width, canvas.height).data
        };
      }
      a = resize(sourceA, plan.before);
      b = resize(sourceB, plan.after);
      width = plan.width;
      height = plan.height;
      difference.width = stage.width = width;
      difference.height = stage.height = height;
      prepared = settings.sizing = sizing.value;
      updateFigures();
      note.textContent =
        sizing.value === 'none'
          ? t(
              'Toleranz gilt pro Farbkanal. Größenunterschiede bleiben sichtbar. Alle Ansichten sind oben links ausgerichtet, ohne Skalierung der Quelldaten.'
            )
          : t(
              'Seitenverhältnis bleibt erhalten, ohne Beschnitt. Abweichende Proportionen werden zentriert mit transparentem Rand eingepasst. Interpolation kann Pixelabweichungen erzeugen. Statistik und PNG verwenden die angepassten Bilder; EXIF bleibt unverändert.'
            );
    }
    valid = true;
    download.disabled = false;
    const result = pixelDiff(a, b, width, height, {
      tolerance: Number(tolerance.value),
      ignoreAlpha: alpha.checked
    });
    difference.getContext('2d').putImageData(new ImageData(result.data, width, height), 0, 0);
    const percent = new Intl.NumberFormat(getLocale(), {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(result.changed / (width * height));
    onSummary(
      t('{percent} geändert', { percent }),
      t('{changed} von {total} geändert.', {
        changed: formatNumber(result.changed),
        total: count(width * height, 'Pixel', 'Pixeln')
      }) +
        ' ' +
        t('Toleranz: {value}.', { value: formatNumber(Number(tolerance.value)) }) +
        (alpha.checked ? ' ' + t('Alpha-Kanal ignoriert.') : '')
    );
    draw();
  }
  sizing.addEventListener('change', compare);
  tolerance.addEventListener('change', compare);
  alpha.addEventListener('change', compare);
  select.addEventListener('change', draw);
  blend.addEventListener('input', draw);
  angle.addEventListener('input', draw);
  function setPosition(value) {
    blend.value = Math.max(0, Math.min(100, value));
    blend.dispatchEvent(new Event('input'));
  }
  let pointer = null;
  function moveDivider(event) {
    const rect = stage.getBoundingClientRect();
    if (!stage.clientWidth || !stage.clientHeight) return;
    const geometry = swipeGeometry(width, height, Number(blend.value) / 100, Number(angle.value));
    setPosition(
      Math.round(
        100 *
          geometry.fractionAt(
            ((event.clientX - rect.left - stage.clientLeft) / stage.clientWidth) * width,
            ((event.clientY - rect.top - stage.clientTop) / stage.clientHeight) * height
          )
      )
    );
  }
  stage.addEventListener('pointerdown', (event) => {
    if (select.value !== 'swipe' || !event.isPrimary || event.button !== 0) return;
    pointer = event.pointerId;
    stage.setPointerCapture(pointer);
    stage.focus({ preventScroll: true });
    moveDivider(event);
  });
  stage.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointer) moveDivider(event);
  });
  const endDrag = () => {
    pointer = null;
  };
  stage.addEventListener('lostpointercapture', endDrag);
  for (const type of ['pointerup', 'pointercancel'])
    stage.addEventListener(type, (event) => {
      if (pointer !== event.pointerId) return;
      if (stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
      endDrag();
    });
  stage.addEventListener('keydown', (event) => {
    if (select.value !== 'swipe') return;
    const step = event.shiftKey ? 10 : 1;
    const changes = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
    if (event.key in changes) setPosition(Number(blend.value) + changes[event.key]);
    else if (event.key === 'Home') setPosition(0);
    else if (event.key === 'End') setPosition(100);
    else return;
    event.preventDefault();
  });
  const resize = new ResizeObserver(draw);
  resize.observe(stageHost);
  download.addEventListener('click', () => {
    download.disabled = true;
    difference.toBlob((blob) => {
      if (!active) return;
      download.disabled = false;
      if (!blob) {
        onError(t('Das Differenzbild konnte nicht exportiert werden.'));
        return;
      }
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'tinydiff-difference.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
  compare();
  return () => {
    active = false;
    resize.disconnect();
    if (pointer !== null && stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
  };
}

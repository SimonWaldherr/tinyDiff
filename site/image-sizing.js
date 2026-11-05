// Contain within the reference canvas: preserve aspect ratio, never crop or stretch.
export function imageSizePlan(a, b, mode = 'none') {
  const reference = mode === 'before' ? a : b;
  const width = mode === 'none' ? Math.max(a.width, b.width) : reference.width;
  const height = mode === 'none' ? Math.max(a.height, b.height) : reference.height;
  const fit = (source) => {
    if (mode === 'none') return { x: 0, y: 0, width: source.width, height: source.height };
    const scale = Math.min(width / source.width, height / source.height);
    const w = source.width * scale,
      h = source.height * scale;
    return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
  };
  return { width, height, before: fit(a), after: fit(b) };
}

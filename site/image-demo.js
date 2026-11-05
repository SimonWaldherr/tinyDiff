import { addDemoExif } from './image-demo-exif.js';
// Shared geometry keeps unchanged regions pixel-identical between both versions.
// Drawn locally so the demo also works offline, without a photo license or download.
function drawScene(context, changed) {
  const c = context;
  const fill = (color, x, y, width, height) => {
    c.fillStyle = color;
    c.fillRect(x, y, width, height);
  };
  const shape = (color, points) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y));
    c.closePath();
    c.fill();
  };
  const circle = (color, x, y, radius) => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
  };
  fill('#e6edf0', 0, 0, 960, 600);
  circle('#edbe77', changed ? 755 : 710, 106, 37);
  shape('#a7bbc4', [
    [0, 300],
    [166, 92],
    [338, 300],
    [514, 120],
    [714, 310],
    [864, 154],
    [960, 270],
    [960, 380],
    [0, 380]
  ]);
  shape('#f6f5ee', [
    [123, 146],
    [166, 92],
    [215, 151],
    [180, 137],
    [157, 157],
    [146, 143]
  ]);
  shape('#f6f5ee', [
    [471, 172],
    [514, 120],
    [567, 181],
    [529, 166],
    [510, 177],
    [492, 158]
  ]);
  shape('#6e9295', [
    [0, 300],
    [98, 249],
    [250, 321],
    [408, 248],
    [580, 315],
    [732, 262],
    [960, 329],
    [960, 409],
    [0, 409]
  ]);
  fill('#91b9bb', 0, 360, 960, 240);
  // Soft, horizontal reflections rather than random noise.
  for (const [x, y, w] of [
    [40, 403, 144],
    [310, 425, 110],
    [690, 399, 174],
    [130, 538, 210],
    [590, 553, 252],
    [433, 485, 96]
  ])
    fill('#b7d1ce', x, y, w, 3);
  shape('#d5c8a3', [
    [0, 346],
    [226, 329],
    [401, 372],
    [503, 416],
    [321, 455],
    [0, 438]
  ]);
  shape('#789275', [
    [0, 336],
    [218, 319],
    [366, 355],
    [422, 383],
    [284, 405],
    [0, 396]
  ]);
  // Cabin, board siding, roof and a lit window.
  fill('#bd8968', 157, 272, 176, 105);
  for (let y = 286; y < 377; y += 16) fill('#a67459', 157, y, 176, 2);
  shape('#40575b', [
    [135, 280],
    [243, 203],
    [353, 280]
  ]);
  shape('#52696b', [
    [243, 203],
    [353, 280],
    [377, 267],
    [269, 194]
  ]);
  fill('#79584b', 290, 217, 18, 33);
  fill(changed ? '#456f7c' : '#885a48', 226, 315, 36, 62);
  circle('#edcc8b', 253, 348, 2);
  fill('#f3d59b', 177, 303, 32, 32);
  fill('#f3d59b', 282, 303, 32, 32);
  for (const x of [177, 282]) {
    fill('#f5e7cc', x + 14, 303, 3, 32);
    fill('#f5e7cc', x, 317, 32, 3);
  }
  // Foreground pines frame the illustration.
  for (const [x, y, size] of [
    [69, 360, 1],
    [383, 367, 0.72],
    [904, 508, 1.35]
  ]) {
    fill('#715f4f', x - 5 * size, y - 60 * size, 10 * size, 75 * size);
    for (let level = 0; level < 3; level++) {
      const top = y - (180 - level * 38) * size;
      const half = (34 + level * 13) * size;
      shape(level % 2 ? '#3c6961' : '#315c56', [
        [x, top],
        [x + half, top + 91 * size],
        [x - half, top + 91 * size]
      ]);
    }
  }
  // One bird is removed and a canoe is added in the revised image.
  c.strokeStyle = '#52696b';
  c.lineWidth = 3;
  c.lineCap = 'round';
  for (const [x, y] of changed
    ? [[410, 105]]
    : [
        [410, 105],
        [452, 126]
      ]) {
    c.beginPath();
    c.moveTo(x - 9, y - 3);
    c.quadraticCurveTo(x - 3, y - 5, x, y + 2);
    c.quadraticCurveTo(x + 3, y - 5, x + 9, y - 3);
    c.stroke();
  }
  if (changed) {
    shape('#b9644c', [
      [600, 464],
      [718, 464],
      [694, 483],
      [624, 483]
    ]);
    fill('#eed8ac', 624, 461, 71, 4);
    c.strokeStyle = '#715f4f';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(646, 447);
    c.lineTo(684, 496);
    c.stroke();
  }
}

export async function createImageDemo() {
  return Promise.all(
    [false, true].map(async (changed) => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 600;
      drawScene(canvas.getContext('2d'), changed);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('image-demo-encoding');
      return new File(
        [await addDemoExif(blob, changed)],
        changed ? 'lake-after.png' : 'lake-before.png',
        {
          type: 'image/png'
        }
      );
    })
  );
}

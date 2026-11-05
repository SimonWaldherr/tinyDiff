import { crc32 } from './checksum.js';

// Deliberately synthetic camera data. The public Eibsee coordinate is documented in README.
export function demoExif(changed) {
  const local = changed ? '07:05:00' : '06:40:00';
  const ifds = [
    [
      [0x010e, 2, 'Synthetic illustration: Eibsee, Bavaria, view towards the Alps'],
      [0x010f, 2, 'tinyDiff'],
      [0x0110, 2, 'Illustration (not a camera)'],
      [0x0112, 3, [1]],
      [0x0131, 2, 'tinyDiff local demo'],
      [0x0132, 2, `2026:06:21 ${local}`],
      [0x8769, 4, [0]],
      [0x8825, 4, [0]]
    ],
    [
      [0x829a, 5, [[1, 250]]],
      [0x829d, 5, [[8, 1]]],
      [0x8827, 3, [100]],
      [0x9003, 2, `2026:06:21 ${local}`],
      [0x9011, 2, '+02:00'],
      [0xa002, 4, [960]],
      [0xa003, 4, [600]]
    ],
    [
      [0, 1, [2, 3, 0, 0]],
      [1, 2, 'N'],
      [
        2,
        5,
        [
          [47, 1],
          [27, 1],
          [22446, 1000]
        ]
      ],
      [3, 2, 'E'],
      [
        4,
        5,
        [
          [10, 1],
          [59, 1],
          [15702, 1000]
        ]
      ],
      [5, 1, [0]],
      [6, 5, [[973, 1]]],
      [
        7,
        5,
        [
          [changed ? 5 : 4, 1],
          [changed ? 5 : 40, 1],
          [0, 1]
        ]
      ],
      [0x1d, 2, '2026:06:21']
    ]
  ];
  const offsets = [8];
  for (const ifd of ifds) offsets.push(offsets.at(-1) + 2 + ifd.length * 12 + 4);
  ifds[0].find(([id]) => id === 0x8769)[2][0] = offsets[1];
  ifds[0].find(([id]) => id === 0x8825)[2][0] = offsets[2];
  const bytes = new Uint8Array(2048),
    data = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  let payload = offsets.at(-1);
  ifds.forEach((ifd, index) => {
    const base = offsets[index];
    data.setUint16(base, ifd.length, true);
    ifd.forEach(([id, type, value], n) => {
      const entry = base + 2 + 12 * n;
      const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 }[type];
      const encoded = type === 2 ? new TextEncoder().encode(value + '\0') : null;
      const count = encoded ? encoded.length : value.length;
      const length = count * size;
      const start = length <= 4 ? entry + 8 : payload;
      data.setUint16(entry, id, true);
      data.setUint16(entry + 2, type, true);
      data.setUint32(entry + 4, count, true);
      if (length > 4) {
        data.setUint32(entry + 8, payload, true);
        payload += length + (length % 2);
      }
      if (encoded) bytes.set(encoded, start);
      else
        value.forEach((v, i) => {
          const p = start + i * size;
          if (type === 1) bytes[p] = v;
          else if (type === 3) data.setUint16(p, v, true);
          else if (type === 4) data.setUint32(p, v, true);
          else {
            data.setUint32(p, v[0], true);
            data.setUint32(p + 4, v[1], true);
          }
        });
    });
  });
  return bytes.slice(0, payload);
}

export async function addDemoExif(blob, changed) {
  const png = new Uint8Array(await blob.arrayBuffer()),
    exif = demoExif(changed);
  // Place the standard eXIf chunk after IHDR, before IDAT.
  const chunk = new Uint8Array(exif.length + 12),
    view = new DataView(chunk.buffer);
  view.setUint32(0, exif.length);
  chunk.set([101, 88, 73, 102], 4);
  chunk.set(exif, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, -4)));
  return new Blob([png.subarray(0, 33), chunk, png.subarray(33)], { type: 'image/png' });
}

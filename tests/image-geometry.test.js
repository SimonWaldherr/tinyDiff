import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeGeometry } from '../site/image-geometry.js';

function area(points) {
  return (
    Math.abs(
      points.reduce((sum, [x, y], i) => {
        const next = points[(i + 1) % points.length];
        return sum + x * next[1] - next[0] * y;
      }, 0)
    ) / 2
  );
}

test('swipe divider supports vertical, horizontal and diagonal views', () => {
  for (const angle of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
    const geometry = swipeGeometry(240, 160, 0.5, angle);
    assert.equal(geometry.line.length, 2, `angle ${angle}`);
    assert.ok(Math.abs(area(geometry.polygon) - 19200) < 1e-6);
    for (const [x, y] of geometry.line) {
      assert.ok(x >= 0 && x <= 240 && y >= 0 && y <= 160);
      assert.ok(Math.abs(geometry.fractionAt(x, y) - 0.5) < 1e-8);
    }
    assert.ok(Math.abs(area(swipeGeometry(240, 160, 0, angle).polygon)) < 1e-6);
    assert.ok(Math.abs(area(swipeGeometry(240, 160, 1, angle).polygon) - 38400) < 1e-6);
  }
});

test('pointer projection follows the angle and clamps outside the image', () => {
  const vertical = swipeGeometry(200, 100, 0.5, 0);
  assert.equal(vertical.fractionAt(60, 99), 0.3);
  assert.equal(vertical.fractionAt(-30, 0), 0);
  assert.equal(vertical.fractionAt(300, 0), 1);
  const horizontal = swipeGeometry(200, 100, 0.5, 90);
  assert.ok(Math.abs(horizontal.fractionAt(50, 75) - 0.75) < 1e-8);
  const reversed = swipeGeometry(200, 100, 0.5, 180);
  assert.ok(Math.abs(reversed.fractionAt(60, 0) - 0.7) < 1e-8);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSizePlan } from '../site/image-sizing.js';
test('resizing preserves aspect ratio, centers padding and never crops', () => {
  const a = { width: 800, height: 600 },
    b = { width: 1600, height: 1200 };
  assert.deepEqual(imageSizePlan(a, b, 'before'), {
    width: 800,
    height: 600,
    before: { x: 0, y: 0, width: 800, height: 600 },
    after: { x: 0, y: 0, width: 800, height: 600 }
  });
  const portrait = { width: 400, height: 800 };
  const plan = imageSizePlan(a, portrait, 'before');
  assert.deepEqual(plan.after, { x: 250, y: 0, width: 300, height: 600 });
  const reverse = imageSizePlan(a, portrait, 'after');
  assert.deepEqual(reverse.before, { x: 0, y: 250, width: 400, height: 300 });
  assert.deepEqual(imageSizePlan(a, b).before, { x: 0, y: 0, width: 800, height: 600 });
  assert.equal(imageSizePlan(a, b).width, 1600);
});

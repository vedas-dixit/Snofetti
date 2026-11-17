import assert from 'node:assert/strict';
import { test } from 'node:test';
import { luminance, mix, parseColor, sameColor, scale } from '../src/colors';

test('reads the colour formats browsers report', () => {
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor('rgb(10 20 30 / 25%)'), { r: 10, g: 20, b: 30, a: 0.25 });
  assert.deepEqual(parseColor('color(srgb 1 0 0.5 / 0.4)'), { r: 255, g: 0, b: 127.5, a: 0.4 });
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
});

test('gives up on a colour it cannot read without a browser', () => {
  assert.equal(parseColor('oklch(70% 0.1 200)'), null);
});

test('brightness runs from black to white', () => {
  assert.equal(luminance([0, 0, 0]), 0);
  assert.ok(Math.abs(luminance([255, 255, 255]) - 1) < 1e-9);
  assert.ok(luminance([0, 255, 0]) > luminance([0, 0, 255]));
});

test('mixing and scaling', () => {
  assert.deepEqual(mix([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25]);
  assert.deepEqual(scale([10, 20, 30], 2), [20, 40, 60]);
  assert.equal(sameColor([1, 2, 3], [1, 2, 3]), true);
  assert.equal(sameColor([1, 2, 3], [1, 2, 4]), false);
});

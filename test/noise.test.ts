import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TEX, bumpTexture, facetTexture, hash, hash2, vnoise } from '../src/noise';

test('hash is repeatable and stays between 0 and 1', () => {
  for (let i = -500; i < 500; i++) {
    const value = hash(i);
    assert.equal(value, hash(i));
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(hash2(1, 2), hash2(2, 1));
});

test('hash spreads its values evenly', () => {
  let sum = 0;
  for (let i = 0; i < 20000; i++) sum += hash(i);
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.02);
});

test('smooth noise stays in range and has no jumps', () => {
  for (let x = 0; x < 50; x += 0.01) {
    const here = vnoise(x, 7), next = vnoise(x + 0.01, 7);
    assert.ok(here >= -1 && here <= 1);
    assert.ok(Math.abs(here - next) < 0.05);
  }
});

test('textures have the expected size and usable values', () => {
  const bump = bumpTexture(), facets = facetTexture();
  assert.equal(bump.x.length, TEX * TEX);
  assert.equal(facets.rand.length, TEX * TEX);
  assert.ok(bump.x.some((v) => v !== 0));
  assert.ok(facets.edge.every((v) => v >= 0));
  assert.ok(facets.rand.every((v) => v >= 0 && v < 1));
  assert.equal(bumpTexture(), bump);
});

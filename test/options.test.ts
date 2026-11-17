import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, fromDataset, resolve } from '../src/options';

test('missing options keep their defaults', () => {
  assert.deepEqual(resolve(DEFAULTS, {}), DEFAULTS);
});

test('numbers are kept inside their allowed range', () => {
  const settings = resolve(DEFAULTS, { density: 50, depth: -3, prefill: 4, maxSurfaces: 0 });
  assert.equal(settings.density, 3);
  assert.equal(settings.depth, 0.3);
  assert.equal(settings.prefill, 1);
  assert.equal(settings.maxSurfaces, 1);
});

test('values that make no sense are ignored', () => {
  const settings = resolve(DEFAULTS, { style: 'lava' as never, density: Number.NaN, reducedMotion: 'loud' as never });
  assert.equal(settings.style, 'real');
  assert.equal(settings.density, 1);
  assert.equal(settings.reducedMotion, 'static');
});

test('a later update only changes what it names', () => {
  const first = resolve(DEFAULTS, { style: 'crystal', from: '12-01', until: '01-06' });
  const second = resolve(first, { density: 0.5 });
  assert.equal(second.style, 'crystal');
  assert.equal(second.from, '12-01');
  assert.equal(second.density, 0.5);
});

test('a season can be removed again', () => {
  const dated = resolve(DEFAULTS, { from: '12-01' });
  assert.equal(resolve(dated, { from: undefined }).from, undefined);
});

test('script tag attributes become options', () => {
  const options = fromDataset({ style: 'soft', density: '0.5', zIndex: '10', interactive: 'false', from: '12-01', until: '01-06', target: '.card' });
  assert.deepEqual(options, { style: 'soft', density: 0.5, zIndex: 10, interactive: false, from: '12-01', until: '01-06', target: '.card' });
});

test('script tag attributes that are not numbers are dropped', () => {
  assert.deepEqual(fromDataset({ density: 'lots' }), {});
});

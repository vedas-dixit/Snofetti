import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Profile, Surface } from '../src/surface';
import { cornerDrop, createSurface, deposit, drift, heightAt, prefill, profile, relax, resize } from '../src/surface';

function surface(width = 300, height = 80, radius = 12): Surface {
  const s = createSurface({} as Element, 1);
  resize(s, width, height, radius, radius, 1);
  return s;
}

const total = (s: Surface): number => s.heights.reduce((sum, h) => sum + h, 0);
const point = (): Profile => ({ rise: 0, lip: 0, base: 0, cover: 0 });

test('a new surface is empty and has one cell every few pixels', () => {
  const s = surface();
  assert.equal(total(s), 0);
  assert.ok(s.count > 80 && s.count < 110);
  assert.ok(s.peak >= 9 && s.peak <= 28);
});

test('wider elements carry taller piles, up to a limit', () => {
  assert.ok(surface(100).peak < surface(300).peak);
  assert.equal(surface(2000).peak, 28);
});

test('snow lands where it is dropped', () => {
  const s = surface();
  deposit(s, 150, 3);
  const middle = Math.round((150 - s.insetL) / s.step);
  assert.ok(s.heights[middle] > 1);
  assert.equal(s.heights[0], 0);
  assert.equal(s.heights[s.count - 1], 0);
});

test('a pile never grows past its peak', () => {
  const s = surface();
  for (let i = 0; i < 4000; i++) deposit(s, 150, 5);
  for (const h of s.heights) assert.ok(h <= s.peak + 1e-3);
});

test('settling keeps the snow and removes steep steps', () => {
  const s = surface();
  for (let i = 0; i < 30; i++) deposit(s, 150, 4);
  const before = total(s);
  for (let pass = 0; pass < 200; pass++) relax(s, pass % 2 === 0);
  assert.ok(Math.abs(total(s) - before) < before * 0.02);
  for (let i = 0; i < s.count - 1; i++) assert.ok(Math.abs(s.heights[i] - s.heights[i + 1]) <= s.step);
});

test('resizing keeps the snow that was there', () => {
  const s = surface(300);
  prefill(s, 0.5);
  const before = total(s) / s.count;
  resize(s, 340, 80, 12, 12, 1);
  const after = total(s) / s.count;
  assert.ok(Math.abs(after - before) < before * 0.1);
});

test('the outline is empty outside the element and rounded at its ends', () => {
  const s = surface();
  prefill(s, 0.8);
  const out = point();
  assert.equal(profile(s, -5, false, out).rise, 0);
  assert.equal(profile(s, 400, false, out).rise, 0);
  const end = profile(s, s.insetL + 1, false, point()).rise;
  const middle = profile(s, 150, false, point()).rise;
  assert.ok(end < middle);
  assert.ok(middle > 5);
});

test('rounded corners lower the edge the snow sits on', () => {
  const s = surface(300, 80, 20);
  assert.ok(cornerDrop(s, 2) > cornerDrop(s, 10));
  assert.equal(cornerDrop(s, 150), 0);
  assert.ok(cornerDrop(s, 298) > 0);
});

test('heights between cells are smooth', () => {
  const s = surface();
  prefill(s, 0.6);
  for (let q = 1; q < s.count - 2; q += 0.25) {
    assert.ok(Math.abs(heightAt(s, q) - heightAt(s, q + 0.25)) < 2);
  }
});

test('drift reports how much the snow changed since it was painted', () => {
  const s = surface();
  s.shaded.set(s.heights);
  assert.equal(drift(s), 0);
  deposit(s, 150, 4);
  assert.ok(drift(s) > 0.5);
});

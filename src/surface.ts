import type { RGB } from './colors';
import { PRISM } from './colors';
import { vnoise } from './noise';

export const CELL = 3; // width of one height-map cell, in CSS pixels

export interface Glint {
  at: number;
  phase: number;
  speed: number;
  big: boolean;
  face: number; // position on the pile, for the realistic style
  edge: number; // position for the crystal style: on the crest or the lip
  hue: number;
}

export interface Mark {
  at: number;
  dark: boolean;
}

export interface Surface {
  readonly el: Element;
  readonly id: number;
  readonly seed: number;
  readonly phase: number[];

  x: number;
  y: number;
  pageX: number;
  pageY: number;
  viewX: number;
  viewY: number;
  layerX: number;
  layerY: number;
  lastX: number;
  lastY: number;

  width: number;
  height: number;
  radiusL: number;
  radiusR: number;
  insetL: number;
  insetR: number;

  heights: Float32Array;
  count: number;
  step: number;
  peak: number; // tallest the pile may get
  endRadius: number;
  lumpA: number;
  lumpB: number;
  lumpC: number;
  marks: Mark[];
  glints: Glint[];
  fewGlints: number;

  fill: RGB;
  backdrop: RGB;

  scale: number;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  top: number; // canvas top relative to the element's top edge; negative is above it
  drawn: boolean;
  placedX: number;
  placedY: number;
  clip: number;
  clipSet: number;
  shaded: Float32Array; // heights at the time of the last paint
  shadedAt: number;
  dirty: boolean;

  near: boolean;
  ready: boolean;
  tracked: boolean;
  fastAt: number;
  covered: boolean;
  shown: boolean;
  parked: boolean;
  pinned: boolean; // fixed, or sticky and currently stuck
  untouchable: boolean; // pointer-events: none, so we cannot test what covers it
  pressable: boolean; // a button or link: pressing it knocks the snow off
  touchedAt: number;
  seenAt: number;
}

export interface Profile {
  rise: number; // above the element's top edge
  lip: number; // hanging down over its front
  base: number; // drop of the top edge on a rounded corner
  cover: number; // 0 no snow, 1 fully formed
}

export function createSurface(el: Element, id: number): Surface {
  const turn = (): number => Math.random() * Math.PI * 2;
  return {
    el, id,
    seed: (Math.random() * 1e6) | 0,
    phase: [turn(), turn(), turn(), turn(), turn()],
    x: 0, y: 0, pageX: 0, pageY: 0, viewX: 0, viewY: 0, layerX: 0, layerY: 0, lastX: 0, lastY: 0,
    width: 0, height: 0, radiusL: 0, radiusR: 0, insetL: 0, insetR: 0,
    heights: new Float32Array(2), count: 2, step: CELL, peak: 10, endRadius: 8,
    lumpA: 8, lumpB: 4, lumpC: 16, marks: [], glints: [], fewGlints: 0,
    fill: [240, 240, 240], backdrop: [255, 255, 255],
    scale: 1, canvas: null, ctx: null, top: 0, drawn: false,
    placedX: NaN, placedY: NaN, clip: 0, clipSet: 0,
    shaded: new Float32Array(2), shadedAt: 0, dirty: true,
    near: false, ready: false, tracked: false, fastAt: -1e9,
    covered: false, shown: false, parked: false, pinned: false, untouchable: false, pressable: false,
    touchedAt: 0, seenAt: 0,
  };
}

function softLump(s: Surface, at: number): number {
  const a = Math.sin(at / s.lumpA + s.phase[0] + 0.9 * Math.sin(at / (s.lumpA * 2.7) + s.phase[2]));
  return 0.62 * (2 * Math.sqrt(a * a + 0.02) - 1) + 0.3 * Math.sin(at / s.lumpB + s.phase[1]) + 0.22 * Math.sin(at / s.lumpC + s.phase[2]);
}

// The snow already there is stretched to the new width, so a layout change does not reset it.
export function resize(s: Surface, width: number, height: number, radiusL: number, radiusR: number, depth: number): void {
  s.width = width;
  s.height = height;
  s.radiusL = Math.min(radiusL, height / 2, width / 2);
  s.radiusR = Math.min(radiusR, height / 2, width / 2);
  s.insetL = s.radiusL * 0.286;
  s.insetR = s.radiusR * 0.286;
  s.peak = Math.max(9, Math.min(28, 6 + width * 0.058)) * depth;

  const span = Math.max(6, width - s.insetL - s.insetR);
  const count = Math.max(4, Math.floor(span / CELL) + 1);
  const next = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const q = (i / (count - 1)) * (s.count - 1), k = Math.floor(q), part = q - k;
    const value = s.heights[k] * (1 - part) + s.heights[Math.min(s.count - 1, k + 1)] * part;
    next[i] = Math.min(value, s.peak);
  }
  s.heights = next;
  s.count = count;
  s.step = span / (count - 1);
  s.endRadius = s.peak * 0.8;
  s.lumpA = s.peak * 0.7;
  s.lumpB = s.peak * 0.33;
  s.lumpC = s.peak * 1.5;

  s.marks = [];
  for (let at = s.insetL + 10; at < width - s.insetR - 10; at += 2) {
    const before = softLump(s, at - 2), here = softLump(s, at), after = softLump(s, at + 2);
    if (here < before && here <= after && here < -0.25) s.marks.push({ at, dark: true });
    if (here > before && here >= after && here > 0.3) s.marks.push({ at, dark: false });
  }

  s.glints = [];
  const room = Math.max(1, width - s.insetL - s.insetR - 10);
  const many = Math.max(6, Math.min(150, Math.round(width / 3.2)));
  s.fewGlints = Math.max(4, Math.min(90, Math.round(width / 6)));
  for (let k = 0; k < many; k++) {
    s.glints.push({
      at: s.insetL + 5 + Math.random() * room,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.5,
      big: Math.random() < 0.14,
      face: 0.12 + Math.random() * 0.62,
      edge: Math.random() < 0.72 ? -0.1 + Math.random() * 0.34 : 0.86 + Math.random() * 0.16,
      hue: (Math.random() * PRISM.length) | 0,
    });
  }

  s.shaded = new Float32Array(count);
  s.dirty = true;
}

export function cornerDrop(s: Surface, at: number): number {
  if (at < s.radiusL) {
    const k = s.radiusL - Math.max(0, at);
    return s.radiusL - Math.sqrt(Math.max(0, s.radiusL * s.radiusL - k * k));
  }
  const fromRight = s.width - at;
  if (fromRight < s.radiusR) {
    const k = s.radiusR - Math.max(0, fromRight);
    return s.radiusR - Math.sqrt(Math.max(0, s.radiusR * s.radiusR - k * k));
  }
  return 0;
}

// Cubic B-spline: passes near the stored values, not through them, so the outline stays smooth.
export function heightAt(s: Surface, cell: number): number {
  const n = s.count, h = s.heights;
  const q = cell < 0 ? 0 : cell > n - 1 ? n - 1 : cell;
  const i = Math.min(n - 2, Math.floor(q)), t = q - i, t2 = t * t, t3 = t2 * t;
  const p0 = h[i > 0 ? i - 1 : 0], p1 = h[i], p2 = h[i + 1], p3 = h[i + 2 < n ? i + 2 : n - 1];
  return (p0 * (1 - 3 * t + 3 * t2 - t3) + p1 * (4 - 6 * t2 + 3 * t3) + p2 * (1 + 3 * t + 3 * t2 - 3 * t3) + p3 * t3) / 6;
}

export function profile(s: Surface, at: number, soft: boolean, out: Profile): Profile {
  const q = (at - s.insetL) / s.step, n = s.count;
  out.base = at >= 0 && at <= s.width ? cornerDrop(s, at) : 0;
  if (q < 0 || q > n - 1) {
    out.rise = 0; out.lip = 0; out.cover = 0;
    return out;
  }
  const h = heightAt(s, q);
  const toEnd = Math.min(q, n - 1 - q) * s.step;
  const t = Math.min(1, toEnd / s.endRadius);
  const rounding = Math.sqrt(1 - (1 - t) * (1 - t));
  const dome = 0.84 + 0.16 * Math.sin((Math.PI * q) / (n - 1));
  const formed = Math.min(1, h / 4), m = s.peak;
  let rise = h * rounding * dome, lip: number;
  if (soft) {
    const reach = Math.max(2.4, m * 0.13);
    rise *= 1 + 0.2 * softLump(s, at);
    lip = formed * rounding * reach * (1 + 0.5 * Math.sin(at / (m * 0.42) + s.phase[3]) + 0.25 * Math.sin(at / (m * 0.19) + s.phase[4]));
  } else {
    const reach = Math.max(2.4, m * 0.17);
    rise *= 1 + 0.17 * vnoise(at / (m * 1.5), s.seed) + 0.08 * vnoise(at / (m * 0.55), s.seed + 101);
    const sag = Math.max(0.3, 0.9 + 0.6 * vnoise(at / (m * 1.2), s.seed + 303) + 0.2 * vnoise(at / (m * 0.4), s.seed + 404));
    lip = Math.min(1, h / (m * 0.4)) * rounding * reach * sag;
  }
  out.rise = rise;
  out.lip = lip;
  out.cover = formed * rounding;
  return out;
}

export function deposit(s: Surface, at: number, amount: number): void {
  const center = Math.round((at - s.insetL) / s.step);
  for (let k = -7; k <= 7; k++) {
    const i = center + k;
    if (i < 0 || i >= s.count) continue;
    const room = 1 - s.heights[i] / s.peak;
    if (room > 0) s.heights[i] += amount * 0.5 * (0.5 + 0.5 * Math.cos((Math.PI * k) / 8)) * room;
  }
}

// Steep steps slide and the rest smooths out, the way loose snow settles.
export function relax(s: Surface, leftToRight: boolean): void {
  const h = s.heights, n = s.count, limit = s.step * 0.9;
  for (let q = 0; q < n - 1; q++) {
    const i = leftToRight ? q : n - 2 - q, diff = h[i] - h[i + 1];
    if (diff > limit) { const move = (diff - limit) * 0.5; h[i] -= move; h[i + 1] += move; }
    else if (diff < -limit) { const move = (-diff - limit) * 0.5; h[i] += move; h[i + 1] -= move; }
  }
  let before = h[0];
  for (let i = 1; i < n - 1; i++) {
    const here = h[i];
    h[i] = here + (before + h[i + 1] - 2 * here) * 0.12;
    before = here;
  }
}

export function prefill(s: Surface, fraction: number): void {
  for (let i = 0; i < s.count; i++) s.heights[i] = Math.min(s.peak, s.peak * fraction * (0.85 + 0.3 * Math.random()));
  for (let pass = 0; pass < 6; pass++) relax(s, pass % 2 === 0);
  s.dirty = true;
}

export function drift(s: Surface): number {
  let most = 0;
  for (let i = 0; i < s.count; i++) {
    const d = Math.abs(s.heights[i] - s.shaded[i]);
    if (d > most) most = d;
  }
  return most;
}

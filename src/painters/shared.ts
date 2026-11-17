import type { RGB } from '../colors';
import { luminance, mix, scale } from '../colors';
import type { Profile, Surface } from '../surface';
import { profile } from '../surface';
import type { SnowStyle } from '../types';

export interface Geo {
  cols: number;
  rows: number;
  top: number;
  scale: number;
  stride: number; // width of the shared pixel buffer
}

export interface Columns {
  top: Float32Array;
  bottom: Float32Array;
  rise: Float32Array;
  cover: Float32Array;
  base: Float32Array;
  average: Float32Array; // rise blurred sideways, to find dips between mounds
  smoothTop: Float32Array;
  smoothBottom: Float32Array;
}

export interface Palette {
  shade: RGB;
  mid: RGB;
  lit: RGB;
  iceShade: RGB;
  iceMid: RGB;
  iceLit: RGB;
  rim: number; // cool outline that keeps snow readable on a near-white page
}

function unit(v: number[]): number[] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

// High and slightly in front, so the face of the pile falls off into blue skylight.
export const LIGHT = unit([-0.46, 0.86, 0.16]);
export const HALF = unit([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
export const SHADOW: RGB = [16, 28, 64];

const NAMES = ['top', 'bottom', 'rise', 'cover', 'base', 'average', 'smoothTop', 'smoothBottom'] as const;
const point: Profile = { rise: 0, lip: 0, base: 0, cover: 0 };

let columns: Columns | null = null;
let capacity = 0;
let image: ImageData | null = null;

export function buffers(): { columns: Columns; pixels: Uint8ClampedArray } {
  return { columns: columns!, pixels: image!.data };
}

export function palette(backdrop: RGB): Palette {
  const lum = luminance(backdrop), ambient = 0.52 + 0.48 * lum, mids = 0.72 + 0.28 * lum, lights = 0.9 + 0.1 * lum;
  return {
    shade: scale(mix([126, 158, 214], backdrop, 0.2), ambient),
    mid: scale(mix([200, 219, 245], backdrop, 0.08), mids),
    lit: scale([243, 247, 253], lights),
    iceShade: scale(mix([88, 134, 212], backdrop, 0.2), ambient),
    iceMid: scale(mix([168, 204, 244], backdrop, 0.1), mids),
    iceLit: scale([228, 240, 253], lights),
    rim: 0.5 * Math.min(1, Math.max(0, (lum - 0.78) / 0.2)),
  };
}

export function layout(s: Surface, style: SnowStyle): Geo {
  const k = s.scale;
  const cols = Math.max(1, Math.ceil(s.width * k));
  const lipMost = Math.max(2.4, s.peak * 0.17) * 1.75;
  const top = -(Math.ceil(s.peak * 1.32) + (style === 'crystal' ? 12 : 4));
  const bottom = Math.min(Math.ceil(lipMost) + 36, Math.ceil(s.height) + 8);
  const rows = Math.max(1, Math.ceil((bottom - top) * k));
  const canvas = s.canvas!;
  if (canvas.width !== cols || canvas.height !== rows) {
    canvas.width = cols;
    canvas.height = rows;
    canvas.style.width = cols / k + 'px';
    canvas.style.height = rows / k + 'px';
    s.drawn = false;
  }
  s.top = top;
  s.shaded.set(s.heights);
  s.dirty = false;

  if (!columns || capacity < cols) {
    capacity = Math.max(cols, capacity * 2);
    const made = {} as Record<(typeof NAMES)[number], Float32Array>;
    for (const name of NAMES) made[name] = new Float32Array(capacity);
    columns = made;
  }
  if (!image || image.width < cols || image.height < rows) {
    image = new ImageData(Math.max(cols, image ? image.width : 0), Math.max(rows, image ? image.height : 0));
  }
  return { cols, rows, top, scale: k, stride: image.width };
}

export function sample(s: Surface, geo: Geo): boolean {
  const { cols, rows, scale: k, stride } = geo;
  const c = columns!, pixels = image!.data;
  let any = false;
  for (let col = 0; col < cols; col++) {
    profile(s, (col + 0.5) / k, false, point);
    c.rise[col] = point.rise;
    c.cover[col] = point.cover;
    c.base[col] = point.base;
    c.top[col] = point.base - point.rise;
    c.bottom[col] = point.base + point.lip;
    if (point.cover > 0.02) any = true;
  }
  if (!any) return false;

  const reach = Math.round(s.peak * 0.45 * k);
  let sum = 0;
  for (let col = -reach; col < cols + reach; col++) {
    const entering = col + reach, leaving = col - reach - 1;
    if (entering < cols) sum += c.rise[entering];
    if (leaving >= 0) sum -= c.rise[leaving];
    if (col >= 0 && col < cols) c.average[col] = sum / (Math.min(cols - 1, col + reach) - Math.max(0, col - reach) + 1);
  }

  for (let row = 0; row < rows; row++) pixels.fill(0, row * stride * 4, (row * stride + cols) * 4);
  return true;
}

export function commit(s: Surface, geo: Geo): void {
  s.ctx!.putImageData(image!, 0, 0, 0, 0, geo.cols, geo.rows);
  s.drawn = true;
}

export function wipe(s: Surface, geo: Geo): void {
  if (s.drawn) {
    s.ctx!.setTransform(1, 0, 0, 1, 0, 0);
    s.ctx!.clearRect(0, 0, geo.cols, geo.rows);
  }
  s.drawn = false;
}

import { PRISM } from './colors';

export interface Sprites {
  flake: HTMLCanvasElement;
  bokeh: HTMLCanvasElement;
  glint: HTMLCanvasElement;
  prism: HTMLCanvasElement[];
  disc: HTMLCanvasElement[];
}

type Stop = [offset: number, color: string];

function radial(size: number, stops: Stop[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function glint(): HTMLCanvasElement {
  const canvas = radial(32, [[0, 'rgba(255,255,255,1)'], [0.17, 'rgba(255,255,255,0.7)'], [0.56, 'rgba(255,255,255,0)']]);
  const ctx = canvas.getContext('2d')!;
  for (const across of [true, false]) {
    const ray = across ? ctx.createLinearGradient(0, 0, 32, 0) : ctx.createLinearGradient(0, 0, 0, 32);
    ray.addColorStop(0.2, 'rgba(255,255,255,0)');
    ray.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    ray.addColorStop(0.8, 'rgba(255,255,255,0)');
    ctx.fillStyle = ray;
    if (across) ctx.fillRect(0, 15.25, 32, 1.5);
    else ctx.fillRect(15.25, 0, 1.5, 32);
  }
  return canvas;
}

const made = new Map<boolean, Sprites>();

// White flakes vanish on a white page, so light pages get grey-blue ones.
export function sprites(lightPage: boolean): Sprites {
  const ready = made.get(lightPage);
  if (ready) return ready;
  const flake = lightPage
    ? radial(32, [[0, 'rgba(206,220,242,1)'], [0.5, 'rgba(192,208,236,0.95)'], [0.8, 'rgba(172,192,228,0.5)'], [1, 'rgba(160,182,222,0)']])
    : radial(32, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.96)'], [0.8, 'rgba(222,232,246,0.5)'], [1, 'rgba(205,220,240,0)']]);
  const bokeh = lightPage
    ? radial(64, [[0, 'rgba(204,218,242,0.85)'], [0.55, 'rgba(194,210,238,0.7)'], [0.82, 'rgba(176,196,232,0.3)'], [1, 'rgba(166,188,226,0)']])
    : radial(64, [[0, 'rgba(255,255,255,0.9)'], [0.55, 'rgba(250,252,255,0.75)'], [0.8, 'rgba(235,242,252,0.3)'], [1, 'rgba(225,235,250,0)']]);
  const tint = (c: readonly number[], alpha: number): string => `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  const set: Sprites = {
    flake,
    bokeh,
    glint: glint(),
    prism: PRISM.map((c) => radial(32, [[0, 'rgba(255,255,255,1)'], [0.24, 'rgba(255,255,255,0.95)'], [0.5, tint(c, 0.6)], [1, tint(c, 0)]])),
    disc: PRISM.map((c) => radial(32, [[0, tint(c, 0.5)], [0.62, tint(c, 0.55)], [0.8, tint(c, 0.8)], [1, tint(c, 0)]])),
  };
  made.set(lightPage, set);
  return set;
}

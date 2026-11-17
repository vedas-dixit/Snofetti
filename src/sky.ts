import type { Sprites } from './sprites';

// 0 far, 1 middle, 2 near: blurred and never lands
export type FlakeKind = 0 | 1 | 2;

export interface Flake {
  id: number;
  x: number;
  y: number;
  size: number;
  fall: number;
  kind: FlakeKind;
  alpha: number;
  phase: number;
  sway: number;
}

export interface Chunk {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
}

// How much each kind moves with the page on scroll.
export const PARALLAX = [0.12, 0.28, 0.5] as const;

export function newFlake(id: number, viewWidth: number, y?: number): Flake {
  const pick = Math.random();
  const base = { id, x: Math.random() * viewWidth, phase: Math.random() * Math.PI * 2, sway: 0.7 + Math.random() * 1.3 };
  if (pick < 0.05) {
    const size = 5 + Math.random() * 5;
    return { ...base, y: y ?? -16, size, fall: 150 + Math.random() * 70, kind: 2, alpha: 0.14 + Math.random() * 0.12 };
  }
  if (pick < 0.5) {
    const size = 1.2 + Math.random() * 1.2;
    return { ...base, y: y ?? -6, size, fall: 52 + size * 20, kind: 1, alpha: 0.9 };
  }
  const size = 0.55 + Math.random() * 0.6;
  return { ...base, y: y ?? -4, size, fall: 26 + Math.random() * 18, kind: 0, alpha: 0.5 + Math.random() * 0.3 };
}

export function drawFlakes(ctx: CanvasRenderingContext2D, art: Sprites, flakes: Flake[], chunks: Chunk[]): void {
  for (const f of flakes) {
    const size = f.size * (f.kind === 2 ? 2.4 : 2.9);
    ctx.globalAlpha = f.alpha;
    ctx.drawImage(f.kind === 2 ? art.bokeh : art.flake, f.x - size / 2, f.y - size / 2, size, size * (1 + f.fall / 520));
  }
  for (const c of chunks) {
    const size = c.size * 2.9;
    ctx.globalAlpha = c.alpha;
    ctx.drawImage(art.flake, c.x - size / 2, c.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

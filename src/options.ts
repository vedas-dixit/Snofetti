import type { SnofettiOptions, SnowStyle, SnowTarget } from './types';

export interface Settings {
  style: SnowStyle;
  target: SnowTarget;
  density: number;
  depth: number;
  wind: number;
  prefill: number;
  interactive: boolean;
  from: string | undefined;
  until: string | undefined;
  zIndex: number;
  maxSurfaces: number;
  reducedMotion: 'static' | 'off' | 'ignore';
}

export const DEFAULTS: Settings = {
  style: 'real',
  target: 'auto',
  density: 1,
  depth: 1,
  wind: 1,
  prefill: 0.3,
  interactive: true,
  from: undefined,
  until: undefined,
  zIndex: 2147483000,
  maxSurfaces: 40,
  reducedMotion: 'static',
};

const STYLES: readonly SnowStyle[] = ['real', 'crystal', 'soft'];
const MOTION = ['static', 'off', 'ignore'] as const;

function between(value: unknown, low: number, high: number, fallback: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(high, Math.max(low, n));
}

export function resolve(current: Settings, patch: SnofettiOptions): Settings {
  const next = { ...current };
  if (patch.style !== undefined && STYLES.includes(patch.style)) next.style = patch.style;
  if (patch.target !== undefined && patch.target !== null && patch.target !== '') next.target = patch.target;
  if (patch.density !== undefined) next.density = between(patch.density, 0, 3, current.density);
  if (patch.depth !== undefined) next.depth = between(patch.depth, 0.3, 2, current.depth);
  if (patch.wind !== undefined) next.wind = between(patch.wind, 0, 3, current.wind);
  if (patch.prefill !== undefined) next.prefill = between(patch.prefill, 0, 1, current.prefill);
  if (patch.interactive !== undefined) next.interactive = Boolean(patch.interactive);
  if ('from' in patch) next.from = patch.from || undefined;
  if ('until' in patch) next.until = patch.until || undefined;
  if (patch.zIndex !== undefined) next.zIndex = Math.round(between(patch.zIndex, -2147483647, 2147483647, current.zIndex));
  if (patch.maxSurfaces !== undefined) next.maxSurfaces = Math.round(between(patch.maxSurfaces, 1, 200, current.maxSurfaces));
  if (patch.reducedMotion !== undefined && MOTION.includes(patch.reducedMotion)) next.reducedMotion = patch.reducedMotion;
  return next;
}

export function fromDataset(data: Record<string, string | undefined>): SnofettiOptions {
  const options: SnofettiOptions = {};
  const number = (key: string): number | undefined => {
    const n = parseFloat(data[key] ?? '');
    return Number.isFinite(n) ? n : undefined;
  };
  if (data.style) options.style = data.style as SnowStyle;
  if (data.target) options.target = data.target;
  if (data.from) options.from = data.from;
  if (data.until) options.until = data.until;
  if (data.reducedMotion) options.reducedMotion = data.reducedMotion as Settings['reducedMotion'];
  if (data.interactive !== undefined) options.interactive = data.interactive !== 'false';
  const numeric = { density: number('density'), depth: number('depth'), wind: number('wind'), prefill: number('prefill'), zIndex: number('zIndex'), maxSurfaces: number('maxSurfaces') };
  for (const [key, value] of Object.entries(numeric)) if (value !== undefined) (options as Record<string, number>)[key] = value;
  return options;
}

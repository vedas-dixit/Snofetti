export type RGB = [number, number, number];

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const PRISM: readonly RGB[] = [
  [255, 226, 150],
  [168, 255, 208],
  [160, 228, 255],
  [176, 196, 255],
  [222, 186, 255],
  [255, 186, 222],
];

const cache = new Map<string, RGBA | null>();
let probe: CanvasRenderingContext2D | null | undefined;

function alphaOf(text: string | undefined): number {
  if (text === undefined) return 1;
  const n = parseFloat(text);
  return text.endsWith('%') ? n / 100 : n;
}

function parsePlain(text: string): RGBA | null {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: alphaOf(rgb[4]) };
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: alphaOf(srgb[4]) };
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

// The browser resolves what we cannot read ourselves (oklch, lab, named colours).
function parseWithCanvas(text: string): RGBA | null {
  if (typeof document === 'undefined') return null;
  if (probe === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    probe = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = text;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

export function parseColor(text: string): RGBA | null {
  const key = text.trim().toLowerCase();
  const known = cache.get(key);
  if (known !== undefined) return known;
  const parsed = parsePlain(key) ?? parseWithCanvas(key);
  if (cache.size > 300) cache.clear();
  cache.set(key, parsed);
  return parsed;
}

export function luminance(c: RGB): number {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

export function mix(a: RGB, b: RGB, amount: number): RGB {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

export function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function sameColor(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function solidFill(el: Element): RGB | null {
  const c = parseColor(getComputedStyle(el).backgroundColor);
  return c && c.a >= 0.5 ? [c.r, c.g, c.b] : null;
}

function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

export function pageDefault(): RGB {
  const scheme = getComputedStyle(document.documentElement).colorScheme || '';
  const dark = scheme.includes('dark') && (!scheme.includes('light') || matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? [18, 18, 18] : [255, 255, 255];
}

// The first solid background among the ancestors.
export function backdropOf(el: Element | null): RGB {
  for (let node = el; node; node = parentOf(node)) {
    const fill = solidFill(node);
    if (fill) return fill;
  }
  return pageDefault();
}

export function surfaceColors(el: Element): { fill: RGB; backdrop: RGB } {
  const backdrop = backdropOf(parentOf(el));
  return { fill: solidFill(el) ?? backdrop, backdrop };
}

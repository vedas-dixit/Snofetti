import type { Surface } from './surface';

let bars = new WeakMap<Element, Element | null>();

export function forgetBars(): void {
  bars = new WeakMap();
}

function barOf(el: Element): Element | null {
  const known = bars.get(el);
  if (known !== undefined) return known;
  let found: Element | null = null;
  for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === 'fixed' || position === 'sticky') {
      found = node;
      break;
    }
  }
  bars.set(el, found);
  return found;
}

function hidden(s: Surface, x: number, y: number, width: number, height: number): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  const hit = document.elementFromPoint(x, y);
  return hit !== null && hit !== s.el && !s.el.contains(hit);
}

// The snow is drawn above the page, so it must be hidden where something else covers
// the element. `clip` cuts the top off a pile that has slid under a sticky bar.
export function checkCover(s: Surface, viewWidth: number, viewHeight: number): void {
  s.covered = false;
  s.clip = 0;
  if (s.untouchable) return;

  const y = s.y + 2;
  if (hidden(s, s.x + s.width * 0.3, y, viewWidth, viewHeight) || hidden(s, s.x + s.width * 0.7, y, viewWidth, viewHeight)) {
    s.covered = true;
    return;
  }

  const above = s.y - Math.min(12, s.peak * 0.5), middle = s.x + s.width / 2;
  if (!s.drawn || above < 0 || above >= viewHeight || middle < 0 || middle >= viewWidth) return;
  const hit = document.elementFromPoint(middle, above);
  const bar = hit ? barOf(hit) : null;
  if (!bar || bar.contains(s.el)) return;
  const edge = bar.getBoundingClientRect().bottom;
  if (edge < s.y + 1) s.clip = Math.max(0, edge - (s.y + s.top));
}

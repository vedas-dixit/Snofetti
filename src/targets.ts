import type { RGB } from './colors';
import { pageDefault, solidFill } from './colors';
import type { SnowTarget } from './types';

const OFF = '[data-snow="off"]';
const MARKED = '[data-snow]:not([data-snow="off"])';
const CANDIDATES = 'button, [role="button"], a, input[type="submit"], input[type="button"], img, video, pre, blockquote, article, aside, figure, form, details, section, div';
const MEDIA = 'img, video';
const EDITABLE = '[contenteditable=""], [contenteditable="true"]';

const SPACING = 64; // vertical room a pile needs before another may sit below it

let warned = false;

// Returns null when nothing is marked and we should pick elements ourselves.
export function explicitTargets(target: SnowTarget, limit: number): Element[] | null {
  let list: Element[];
  if (target === 'auto') {
    list = Array.from(document.querySelectorAll(MARKED));
    if (!list.length) return null;
  } else if (typeof target === 'string') {
    try {
      list = Array.from(document.querySelectorAll(target));
    } catch {
      if (!warned) console.warn(`[snofetti] "${target}" is not a valid CSS selector.`);
      warned = true;
      list = [];
    }
  } else if (target instanceof Element) {
    list = [target];
  } else {
    list = Array.from(target);
  }
  return list.filter((el) => el.isConnected && !el.closest(OFF)).slice(0, limit);
}

interface Box {
  left: number;
  right: number;
  top: number;
}

// Picks elements with a visible box of their own. Works in small steps so a large
// page never freezes.
export class AutoScan {
  done = false;
  private readonly list: Element[];
  private index = 0;
  private readonly taken: Box[] = [];
  private readonly behind = new Map<Element, RGB>();
  private readonly fallback: RGB = pageDefault();

  constructor(private readonly known: ReadonlySet<Element> | ReadonlyMap<Element, unknown>, private readonly limit: number) {
    this.list = Array.from(document.querySelectorAll(CANDIDATES));
  }

  step(budget: number): Element[] {
    const found: Element[] = [];
    const end = performance.now() + budget;
    while (this.index < this.list.length) {
      const el = this.list[this.index++];
      if (this.accept(el)) found.push(el);
      if (this.taken.length >= this.limit) break;
      if ((this.index & 15) === 0 && performance.now() > end) return found;
    }
    this.done = true;
    return found;
  }

  private accept(el: Element): boolean {
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const box: Box = { left: rect.left + window.scrollX, right: rect.right + window.scrollX, top: rect.top + window.scrollY };
    if (this.known.has(el)) {
      this.taken.push(box);
      return false;
    }
    const pageWidth = document.documentElement.clientWidth;
    if (rect.width < 56 || rect.height < 28 || rect.width > pageWidth - 16) return false;
    if (box.top < 10) return false;
    if (el.closest(OFF) || el.closest(EDITABLE)) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const style = getComputedStyle(el);
    if (style.position === 'fixed' && rect.height > window.innerHeight * 0.6) return false;
    if (!this.hasVisibleBox(el, style)) return false;
    if (this.crowded(box)) return false;
    this.taken.push(box);
    return true;
  }

  private hasVisibleBox(el: Element, style: CSSStyleDeclaration): boolean {
    if (el.matches(MEDIA)) return true;
    if (style.backgroundImage !== 'none') return true;
    if (style.boxShadow !== 'none') return true;
    if (parseFloat(style.borderTopWidth) >= 1 && style.borderTopStyle !== 'none') return true;
    const fill = solidFill(el);
    if (!fill) return false;
    const back = this.backdrop(el.parentElement);
    return Math.abs(fill[0] - back[0]) + Math.abs(fill[1] - back[1]) + Math.abs(fill[2] - back[2]) > 24;
  }

  private backdrop(el: Element | null): RGB {
    const walked: Element[] = [];
    let found: RGB | undefined;
    for (let node = el; node; node = node.parentElement) {
      found = this.behind.get(node);
      if (found) break;
      walked.push(node);
      found = solidFill(node) ?? undefined;
      if (found) break;
    }
    const color = found ?? this.fallback;
    for (const node of walked) this.behind.set(node, color);
    return color;
  }

  private crowded(box: Box): boolean {
    for (const other of this.taken) {
      const overlap = Math.min(box.right, other.right) - Math.max(box.left, other.left);
      if (overlap <= 0.5 * Math.min(box.right - box.left, other.right - other.left)) continue;
      if (box.top > other.top - 14 && box.top < other.top + SPACING) return true;
    }
    return false;
  }
}

import { backdropOf, luminance, sameColor, surfaceColors } from './colors';
import { checkCover, forgetBars } from './cover';
import type { Layer } from './layers';
import { createLayer, createPileCanvas, createSkyCanvas, setLayerDepth, showLayer } from './layers';
import { hash } from './noise';
import type { Settings } from './options';
import { paintCrystal } from './painters/crystal';
import { paintReal } from './painters/real';
import { layout, sample, wipe } from './painters/shared';
import { paintSoft } from './painters/soft';
import type { Chunk, Flake } from './sky';
import { PARALLAX, drawFlakes, newFlake } from './sky';
import type { Sprites } from './sprites';
import { sprites } from './sprites';
import type { Profile, Surface } from './surface';
import { createSurface, deposit, drift, prefill, profile, relax, resize } from './surface';
import { AutoScan, explicitTargets } from './targets';

const PRESSABLE = 'button, a[href], [role="button"], input[type="submit"], input[type="button"], summary';
const OFF = '[data-snow="off"]';

const REGISTRY_LIMIT = 300;
const FLAKES_PER_PIXEL = 0.0006; // of viewport, at density 1
const MOST_FLAKES = 1200;
const MOST_CHUNKS = 600;
const CATCH = 0.7; // share of flakes that stay where they land
const SHED_SPEED = 520; // px per second
const PAINT_BUDGET = 5; // ms of painting per frame
const REPAINT_AFTER = 0.3; // px of change before a pile is painted again

const point: Profile = { rise: 0, lip: 0, base: 0, cover: 0 };

function isFixed(el: Element): boolean {
  for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
}

// Flakes are drawn on one canvas that covers the viewport. Every pile has a small
// canvas of its own, placed in page coordinates, so it scrolls with the page.
export class Engine {
  private settings: Settings;
  private readonly still: boolean; // reduced motion: piles only, nothing moves

  private readonly pageLayer: Layer;
  private readonly viewLayer: Layer;
  private readonly sky: HTMLCanvasElement;
  private readonly skyCtx: CanvasRenderingContext2D;
  private art: Sprites;

  private readonly surfaces = new Map<Element, Surface>();
  private readonly live: Surface[] = [];
  private readonly catchers: Surface[] = [];
  private readonly due: Surface[] = [];
  private readonly flakes: Flake[] = [];
  private readonly chunks: Chunk[] = [];

  private readonly watcher: IntersectionObserver;
  private readonly pageChanges: MutationObserver;
  private readonly themeChanges: MutationObserver;
  private readonly undo: Array<() => void> = [];
  private scan: AutoScan | null = null;
  private choosing = false;

  private frameId = 0;
  private lastFrame = 0;
  private tick = 0;
  private nextId = 1;
  private paused = false;

  private viewWidth = 0;
  private viewHeight = 0;
  private pixelRatio = 1;
  private skyScale = 1;
  private skyUsed = false;
  private scrollTop = 0;
  private spawnDebt = 0;
  private quality = 1;
  private pace = 1 / 60;
  private slowFor = 0;

  private scanAt = 0;
  private coverAt = 0;
  private colorsAt = 0;
  private colorsAgainAt = Infinity;
  private ambientAt = 0;
  private tidyAt = 0;

  constructor(settings: Settings, still: boolean) {
    this.settings = settings;
    this.still = still;

    this.pageLayer = createLayer(false, settings.zIndex);
    this.viewLayer = createLayer(true, settings.zIndex);
    this.sky = createSkyCanvas();
    this.skyCtx = this.sky.getContext('2d')!;
    if (still) this.sky.style.display = 'none';
    this.viewLayer.root.appendChild(this.sky);
    document.body.append(this.pageLayer.host, this.viewLayer.host);
    this.art = sprites(this.pageIsLight());

    this.watcher = new IntersectionObserver(this.onWatch, { rootMargin: '150px 0px' });
    this.pageChanges = new MutationObserver(this.onPageChange);
    this.pageChanges.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'data-snow'] });
    this.themeChanges = new MutationObserver(this.onThemeChange);
    this.themeChanges.observe(document.documentElement, { attributes: true });
    this.themeChanges.observe(document.body, { attributes: true });

    this.listen(window, 'scroll', this.onScroll, { passive: true, capture: true });
    this.listen(window, 'resize', this.onResize, { passive: true });
    this.listen(document, 'pointerdown', this.onPress, { passive: true, capture: true });
    this.listen(window, 'beforeprint', () => this.show(false));
    this.listen(window, 'afterprint', () => this.show(!this.paused));
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    this.listen(scheme, 'change', this.onThemeChange);

    this.measureView();
    this.scrollTop = window.scrollY;
    if (!still) {
      const count = this.flakeTarget();
      for (let i = 0; i < count; i++) this.flakes.push(newFlake(this.nextId++, this.viewWidth, Math.random() * this.viewHeight));
    }
    this.frameId = requestAnimationFrame(this.frame);
  }

  get running(): boolean {
    return !this.paused;
  }

  update(next: Settings): void {
    const before = this.settings;
    this.settings = next;
    if (next.style !== before.style) for (const s of this.surfaces.values()) s.dirty = true;
    if (next.depth !== before.depth) for (const s of this.surfaces.values()) s.width = -1;
    if (next.zIndex !== before.zIndex) {
      setLayerDepth(this.pageLayer, next.zIndex);
      setLayerDepth(this.viewLayer, next.zIndex);
    }
    if (next.target !== before.target) {
      for (const s of [...this.surfaces.values()]) this.remove(s);
      this.scan = null;
      this.choosing = false;
      this.scanAt = 0;
    }
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.frameId);
    this.show(false);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.show(true);
    for (const s of this.surfaces.values()) s.tracked = false;
    this.lastFrame = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
  }

  shake(target?: Element | string): void {
    let chosen: Element[] | null = null;
    if (typeof target === 'string') {
      try {
        chosen = Array.from(document.querySelectorAll(target));
      } catch {
        chosen = [];
      }
    } else if (target) chosen = [target];
    for (const s of this.surfaces.values()) {
      if (!s.ready) continue;
      if (chosen && !chosen.some((el) => el === s.el || el.contains(s.el))) continue;
      this.shed(s, 1, 0, -120);
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.frameId);
    this.watcher.disconnect();
    this.pageChanges.disconnect();
    this.themeChanges.disconnect();
    for (const remove of this.undo) remove();
    this.pageLayer.host.remove();
    this.viewLayer.host.remove();
    this.surfaces.clear();
    this.flakes.length = 0;
    this.chunks.length = 0;
  }

  private listen(target: EventTarget, type: string, handler: (event: any) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.undo.push(() => target.removeEventListener(type, handler, options));
  }

  private readonly onWatch = (entries: IntersectionObserverEntry[]): void => {
    for (const entry of entries) {
      const s = this.surfaces.get(entry.target);
      if (!s) continue;
      s.near = entry.isIntersecting;
      if (s.near) {
        s.tracked = false;
        s.touchedAt = performance.now();
        this.coverAt = 0;
      } else this.park(s);
    }
  };

  private readonly onPageChange = (records: MutationRecord[]): void => {
    const now = performance.now();
    const nodesChanged = records.some((record) => record.type === 'childList');
    const wait = this.choosing ? (nodesChanged ? 1200 : 2500) : nodesChanged ? 250 : 400;
    this.scanAt = Math.min(this.scanAt, now + wait);
    this.coverAt = Math.min(this.coverAt, now + 80);
  };

  // Theme switches usually animate, so colours are read again once they settle.
  private readonly onThemeChange = (): void => {
    const now = performance.now();
    this.colorsAt = Math.min(this.colorsAt, now + 60);
    this.colorsAgainAt = now + 700;
  };

  private readonly onScroll = (): void => {
    this.coverAt = Math.min(this.coverAt, performance.now() + 40);
  };

  private readonly onResize = (): void => {
    this.measureView();
    for (const s of this.surfaces.values()) s.tracked = false;
    this.coverAt = 0;
  };

  private readonly onPress = (event: Event): void => {
    if (!this.settings.interactive || this.still) return;
    for (let node = event.target instanceof Element ? event.target : null; node; node = node.parentElement) {
      const s = this.surfaces.get(node);
      if (!s) continue;
      if (s.pressable && s.near && s.ready) this.shed(s, 1, 0, -120);
      return;
    }
  };

  private readonly frame = (now: number): void => {
    this.frameId = requestAnimationFrame(this.frame);
    if (this.still && now - this.lastFrame < 200) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.tick++;

    this.read(dt, now);
    if (!this.still) this.simulate(dt, now);
    this.upkeep(now);
    this.place();
    this.paintDue(now);
    if (!this.still) this.drawSky(now);
    this.govern(dt);
  };

  private read(dt: number, now: number): void {
    const page = this.pageLayer.host.getBoundingClientRect();
    const view = this.viewLayer.host.getBoundingClientRect();
    const live = this.live, most = this.settings.maxSurfaces;
    const shedding = this.settings.interactive && !this.still;
    live.length = 0;

    for (const s of this.surfaces.values()) {
      if (!s.near) continue;
      if (live.length >= most) break;
      if (!s.el.isConnected) {
        this.scanAt = Math.min(this.scanAt, now);
        continue;
      }
      const box = s.el.getBoundingClientRect();
      if (box.width < 8 || box.height < 4) {
        this.park(s);
        continue;
      }
      if (!s.ready || Math.abs(box.width - s.width) > 0.5 || Math.abs(box.height - s.height) > 0.5) this.measure(s, box);

      const pageX = box.left - page.left, pageY = box.top - page.top;
      const viewX = box.left - view.left, viewY = box.top - view.top;
      if (s.tracked) {
        // After a scroll an element has kept its place either on the page or in the
        // viewport. A sticky header switches between the two as it sticks.
        const movedOnPage = Math.abs(pageX - s.pageX) > 0.5 || Math.abs(pageY - s.pageY) > 0.5;
        const movedInView = Math.abs(viewX - s.viewX) > 0.5 || Math.abs(viewY - s.viewY) > 0.5;
        if (movedOnPage !== movedInView && movedOnPage !== s.pinned) this.rehome(s, movedOnPage);
      }
      s.pageX = pageX;
      s.pageY = pageY;
      s.viewX = viewX;
      s.viewY = viewY;
      s.x = box.left;
      s.y = box.top;
      s.lastX = s.layerX;
      s.lastY = s.layerY;
      s.layerX = s.pinned ? viewX : pageX;
      s.layerY = s.pinned ? viewY : pageY;

      // One fast frame is a layout jump. Two close together is real movement.
      if (s.tracked && shedding) {
        const vx = (s.layerX - s.lastX) / dt, vy = (s.layerY - s.lastY) / dt, speed = Math.hypot(vx, vy);
        if (speed > SHED_SPEED) {
          if (now - s.fastAt < 150) this.shed(s, Math.min(0.55, (speed - SHED_SPEED) / 1300), vx, vy);
          s.fastAt = now;
        }
      }
      s.tracked = true;
      s.seenAt = now;
      live.push(s);
    }
  }

  private measure(s: Surface, box: DOMRect): void {
    const style = getComputedStyle(s.el);
    const corner = (text: string): number => {
      const n = parseFloat(text) || 0;
      return text.includes('%') ? (n / 100) * box.width : n;
    };
    if (!s.ready) {
      s.pinned = isFixed(s.el);
      s.pressable = s.el.matches(PRESSABLE);
    }
    s.untouchable = style.pointerEvents === 'none';
    s.scale = Math.max(1, Math.min(this.pixelRatio, 2400 / box.width));
    resize(s, box.width, box.height, corner(style.borderTopLeftRadius), corner(style.borderTopRightRadius), this.settings.depth);
    this.readColors(s);
    if (!s.ready) {
      const share = this.still ? Math.max(0.8, this.settings.prefill) : this.settings.prefill * (0.75 + 0.5 * Math.random());
      if (share > 0) prefill(s, share);
      s.ready = true;
    }
    s.touchedAt = performance.now();
  }

  private rehome(s: Surface, pinned: boolean): void {
    s.pinned = pinned;
    s.tracked = false;
    s.placedX = s.placedY = NaN;
    if (s.canvas) this.attach(s, s.canvas);
  }

  private attach(s: Surface, canvas: HTMLCanvasElement): void {
    if (s.pinned) this.viewLayer.root.insertBefore(canvas, this.sky);
    else this.pageLayer.root.appendChild(canvas);
  }

  private readColors(s: Surface): void {
    const colors = surfaceColors(s.el);
    if (sameColor(colors.fill, s.fill) && sameColor(colors.backdrop, s.backdrop)) return;
    s.fill = colors.fill;
    s.backdrop = colors.backdrop;
    s.dirty = true;
  }

  private pageIsLight(): boolean {
    return luminance(backdropOf(document.body)) > 0.6;
  }

  private flakeTarget(): number {
    return Math.min(MOST_FLAKES, this.viewWidth * this.viewHeight * FLAKES_PER_PIXEL * this.settings.density * this.quality);
  }

  private simulate(dt: number, now: number): void {
    const settings = this.settings, soft = settings.style === 'soft';
    const width = this.viewWidth, height = this.viewHeight;
    const flip = this.tick % 2 === 0;

    for (const s of this.live) if (now - s.touchedAt < 2500) relax(s, flip);

    const target = this.flakeTarget();
    this.spawnDebt += (target / (height / 56)) * dt;
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      if (this.flakes.length < target) this.flakes.push(newFlake(this.nextId++, width));
    }

    const catchers = this.catchers;
    catchers.length = 0;
    for (const s of this.live) if (!s.covered && s.y > -10 && s.y < height + s.peak * 1.4) catchers.push(s);

    const wind = settings.wind * (9 + 8 * Math.sin(now * 0.00021) + 5 * Math.sin(now * 0.00057 + 1.3));
    const scrolled = window.scrollY - this.scrollTop;
    this.scrollTop = window.scrollY;
    // Fewer flakes each carry more snow, so piles grow at the same pace.
    const load = 1.4 / Math.max(0.3, settings.density);
    const flakes = this.flakes;

    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.x += (Math.sin(now * 0.001 * f.sway + f.phase) * 13 + wind * (0.5 + f.size * 0.22)) * dt;
      f.y += f.fall * dt;
      if (scrolled) {
        f.y -= scrolled * PARALLAX[f.kind];
        if (f.y < -24) f.y += height + 48;
        else if (f.y > height + 24) f.y -= height + 48;
      }
      if (f.x > width + 30) f.x -= width + 60;
      else if (f.x < -30) f.x += width + 60;

      if (f.kind !== 2) {
        for (const s of catchers) {
          const at = f.x - s.x;
          if (at < s.insetL || at > s.width - s.insetR) continue;
          if (f.y < s.y - s.peak * 1.4 || f.y > s.y + 10) continue;
          profile(s, at, soft, point);
          if (f.y < s.y + point.base - point.rise) continue;
          if (hash(f.id * 7919 + s.id) >= CATCH) continue;
          deposit(s, at, (1.3 + f.size) * load);
          s.touchedAt = now;
          f.y = Infinity;
          break;
        }
      }
      if (f.y > height + 20) {
        flakes[i] = flakes[flakes.length - 1];
        flakes.pop();
      }
    }

    const chunks = this.chunks;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i];
      c.vy += 900 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.alpha -= 0.5 * dt;
      if (c.y > height + 20 || c.alpha <= 0) {
        chunks[i] = chunks[chunks.length - 1];
        chunks.pop();
      }
    }

    if (now >= this.ambientAt) {
      this.ambientAt = now + 500;
      this.snowElsewhere(now);
    }
  }

  // Elements outside the viewport never meet a flake, so they get their snow directly.
  private snowElsewhere(now: number): void {
    const everywhere = this.settings.density === 0;
    for (const s of this.surfaces.values()) {
      if (!s.ready || (s.near && !everywhere)) continue;
      const share = s.width * 0.018;
      let drops = Math.floor(share);
      if (Math.random() < share - drops) drops++;
      if (!drops) continue;
      const room = s.width - s.insetL - s.insetR;
      for (let k = 0; k < drops; k++) deposit(s, s.insetL + Math.random() * room, 2.75);
      s.touchedAt = now;
    }
  }

  private shed(s: Surface, share: number, vx: number, vy: number): void {
    const chunks = this.chunks;
    for (let i = 0; i < s.count; i++) {
      const part = s.heights[i] * share;
      if (!this.still && i % 2 === 0 && part > 0.7 && chunks.length < MOST_CHUNKS) {
        const pieces = Math.min(4, Math.ceil(part / 5));
        for (let k = 0; k < pieces; k++) {
          chunks.push({
            x: s.x + s.insetL + i * s.step + (Math.random() - 0.5) * 5,
            y: s.y - Math.random() * s.heights[i],
            size: 1.3 + Math.random() * 2.3,
            vx: vx * 0.3 + (Math.random() - 0.5) * 70,
            vy: vy * 0.3 - Math.random() * 50,
            alpha: 1,
          });
        }
      }
      s.heights[i] -= part;
    }
    s.dirty = true;
    s.touchedAt = performance.now();
  }

  private upkeep(now: number): void {
    if (now >= this.scanAt) {
      this.scanAt = Infinity;
      this.rescan();
    }
    if (this.scan) {
      for (const el of this.scan.step(3)) this.add(el);
      if (this.scan.done) this.scan = null;
    }
    if (now >= this.coverAt) {
      this.coverAt = now + 700;
      for (const s of this.live) checkCover(s, this.viewWidth, this.viewHeight);
    }
    if (now >= this.colorsAt || now >= this.colorsAgainAt) {
      this.colorsAt = now + 3000;
      if (now >= this.colorsAgainAt) this.colorsAgainAt = Infinity;
      for (const s of this.live) this.readColors(s);
      this.art = sprites(this.pageIsLight());
    }
    if (now >= this.tidyAt) {
      this.tidyAt = now + 2000;
      this.tidy();
    }
  }

  private rescan(): void {
    const chosen = explicitTargets(this.settings.target, REGISTRY_LIMIT);
    if (chosen) {
      this.choosing = false;
      this.scan = null;
      const keep = new Set(chosen);
      for (const s of [...this.surfaces.values()]) if (!keep.has(s.el)) this.remove(s);
      for (const el of chosen) this.add(el);
      return;
    }
    for (const s of [...this.surfaces.values()]) if (!s.el.isConnected || s.el.closest(OFF)) this.remove(s);
    this.choosing = true;
    this.scan = new AutoScan(this.surfaces, REGISTRY_LIMIT);
  }

  private add(el: Element): void {
    if (this.surfaces.has(el) || this.surfaces.size >= REGISTRY_LIMIT) return;
    this.surfaces.set(el, createSurface(el, this.nextId++));
    this.watcher.observe(el);
  }

  private remove(s: Surface): void {
    this.watcher.unobserve(s.el);
    if (s.canvas) s.canvas.remove();
    this.surfaces.delete(s.el);
  }

  private park(s: Surface): void {
    if (s.canvas && !s.parked) s.canvas.style.display = 'none';
    s.parked = true;
    s.tracked = false;
  }

  private tidy(): void {
    // Some frameworks rebuild <body> and drop nodes they do not know.
    if (!this.pageLayer.host.isConnected) document.body.appendChild(this.pageLayer.host);
    if (!this.viewLayer.host.isConnected) document.body.appendChild(this.viewLayer.host);
    forgetBars();

    const allowed = this.settings.maxSurfaces * 2;
    const idle: Surface[] = [];
    let canvases = 0;
    for (const s of this.surfaces.values()) {
      if (!s.canvas) continue;
      canvases++;
      if (!s.near) idle.push(s);
    }
    if (canvases <= allowed) return;
    idle.sort((a, b) => a.seenAt - b.seenAt);
    for (const s of idle) {
      if (canvases-- <= allowed) break;
      s.canvas!.remove();
      s.canvas = null;
      s.ctx = null;
      s.drawn = false;
      s.shown = false;
      s.dirty = true;
    }
  }

  private place(): void {
    const ratio = this.pixelRatio;
    for (const s of this.live) {
      const canvas = s.canvas;
      if (!canvas) continue;
      if (s.parked) {
        canvas.style.display = '';
        s.parked = false;
      }
      const visible = s.drawn && !s.covered;
      if (visible !== s.shown) {
        canvas.style.opacity = visible ? '1' : '0';
        s.shown = visible;
      }
      // Snap to device pixels so the grain stays crisp.
      const x = Math.round(s.layerX * ratio) / ratio, y = Math.round((s.layerY + s.top) * ratio) / ratio;
      if (x !== s.placedX || y !== s.placedY) {
        canvas.style.transform = `translate(${x}px,${y}px)`;
        s.placedX = x;
        s.placedY = y;
      }
      if (s.clip !== s.clipSet) {
        canvas.style.clipPath = s.clip > 0 ? `inset(${s.clip.toFixed(1)}px 0 0 0)` : '';
        s.clipSet = s.clip;
      }
    }
  }

  private paintDue(now: number): void {
    const due = this.due;
    due.length = 0;
    for (const s of this.live) {
      if (s.dirty || !s.canvas || (now - s.shadedAt > 80 && drift(s) > REPAINT_AFTER)) due.push(s);
    }
    if (!due.length) return;
    due.sort((a, b) => a.shadedAt - b.shadedAt);
    const stop = performance.now() + PAINT_BUDGET;
    for (const s of due) {
      this.paint(s);
      s.shadedAt = now;
      if (performance.now() > stop) break;
    }
  }

  private paint(s: Surface): void {
    if (!s.canvas) {
      s.canvas = createPileCanvas();
      s.ctx = s.canvas.getContext('2d');
      s.placedX = s.placedY = NaN;
      s.clipSet = 0;
      s.parked = false;
      this.attach(s, s.canvas);
    }
    if (!s.ctx) return;
    const style = this.settings.style, geo = layout(s, style);
    if (style === 'soft') paintSoft(s, geo);
    else if (!sample(s, geo)) wipe(s, geo);
    else if (style === 'crystal') paintCrystal(s, geo);
    else paintReal(s, geo);
  }

  private drawSky(now: number): void {
    const ctx = this.skyCtx, k = this.skyScale;
    const glints = this.settings.style !== 'soft';
    const busy = this.flakes.length > 0 || this.chunks.length > 0 || (glints && this.live.length > 0);
    if (!busy && !this.skyUsed) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    this.skyUsed = busy;
    if (!busy) return;
    if (glints) this.drawGlints(ctx, now);
    drawFlakes(ctx, this.art, this.flakes, this.chunks);
  }

  private drawGlints(ctx: CanvasRenderingContext2D, now: number): void {
    const crystal = this.settings.style === 'crystal';
    const floor = crystal ? 0.82 : 0.9, art = this.art, height = this.viewHeight;
    if (!crystal) ctx.globalCompositeOperation = 'lighter';
    for (const s of this.live) {
      if (!s.shown || s.y < -4 || s.y - s.peak > height) continue;
      const count = crystal ? s.glints.length : s.fewGlints;
      const turn = (s.layerX + s.layerY) * 0.07, time = now * 0.001 + turn;
      const hiddenAbove = s.clip > 0 ? s.y + s.top + s.clip : -Infinity;
      for (let i = 0; i < count; i++) {
        const g = s.glints[i], wave = Math.sin(time * g.speed + g.phase);
        if (wave < floor) continue;
        profile(s, g.at, false, point);
        const thick = point.rise + point.lip;
        if (thick < 5) continue;
        let glow = (wave - floor) / (1 - floor);
        glow = glow * glow * (3 - 2 * glow);
        const x = s.x + g.at, y = s.y + point.base - point.rise + (crystal ? g.edge : g.face) * thick;
        if (y < hiddenAbove) continue;
        if (crystal) {
          const size = g.big ? 7 : 5;
          ctx.globalAlpha = glow * (g.big ? 0.55 : 1);
          ctx.drawImage(g.big ? art.disc[g.hue] : art.prism[g.hue], x - size / 2, y - size / 2, size, size);
        } else {
          const size = g.big ? 7 : 4;
          ctx.globalAlpha = glow * (g.big ? 0.95 : 0.8);
          ctx.drawImage(art.glint, x - size / 2, y - size / 2, size, size);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private measureView(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (ratio !== this.pixelRatio) for (const s of this.surfaces.values()) s.width = -1;
    this.pixelRatio = ratio;
    this.viewWidth = document.documentElement.clientWidth || window.innerWidth;
    this.viewHeight = window.innerHeight;
    // Cap the sky canvas at about six million pixels.
    const area = Math.max(1, this.viewWidth * this.viewHeight);
    this.skyScale = Math.min(ratio, Math.max(1, Math.sqrt(6e6 / area)));
    this.sky.width = Math.max(1, Math.round(this.viewWidth * this.skyScale));
    this.sky.height = Math.max(1, Math.round(this.viewHeight * this.skyScale));
    this.skyUsed = false;
  }

  private show(visible: boolean): void {
    showLayer(this.pageLayer, visible);
    showLayer(this.viewLayer, visible);
  }

  // If the page cannot keep up, let less snow fall.
  private govern(dt: number): void {
    if (this.still) return;
    this.pace = this.pace * 0.95 + dt * 0.05;
    if (this.pace <= 0.03) {
      this.slowFor = 0;
      return;
    }
    this.slowFor += dt;
    if (this.slowFor > 2 && this.quality > 0.3) {
      this.quality *= 0.7;
      this.slowFor = 0;
      const target = Math.floor(this.flakeTarget());
      if (this.flakes.length > target) this.flakes.length = target;
    }
  }
}

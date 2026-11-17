import { Engine } from './engine';
import type { Settings } from './options';
import { DEFAULTS, resolve } from './options';
import { inSeason } from './season';
import type { Snofetti, SnofettiOptions } from './types';

export type { Snofetti, SnofettiOptions, SnowStyle, SnowTarget } from './types';

// Kept on globalThis so two copies of the library on one page still share one snowfall.
const SLOT = Symbol.for('snofetti.instance');
const store = globalThis as unknown as Record<symbol, Snofetti | undefined>;

const IDLE: Snofetti = {
  active: false,
  pause() {},
  resume() {},
  shake() {},
  update() {},
  stop() {},
};

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof requestAnimationFrame === 'function' &&
    typeof IntersectionObserver === 'function' &&
    typeof MutationObserver === 'function' &&
    typeof document.createElement('canvas').getContext === 'function'
  );
}

class Controller implements Snofetti {
  private settings: Settings;
  private engine: Engine | null = null;
  private paused = false;
  private stopped = false;
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(options: SnofettiOptions) {
    this.settings = resolve(DEFAULTS, options);
    this.motion.addEventListener('change', this.restart);
    this.begin();
  }

  get active(): boolean {
    return this.engine !== null && !this.paused;
  }

  pause(): void {
    this.paused = true;
    this.engine?.pause();
  }

  resume(): void {
    this.paused = false;
    this.engine?.resume();
  }

  shake(target?: Element | string): void {
    this.engine?.shake(target);
  }

  update(options: SnofettiOptions): void {
    if (this.stopped) return;
    const before = this.settings;
    const next = (this.settings = resolve(before, options));
    const gateChanged = next.from !== before.from || next.until !== before.until || next.reducedMotion !== before.reducedMotion;
    if (gateChanged || !this.engine) this.restart();
    else this.engine.update(next);
  }

  stop(): void {
    this.stopped = true;
    this.motion.removeEventListener('change', this.restart);
    this.engine?.destroy();
    this.engine = null;
    if (store[SLOT] === this) delete store[SLOT];
  }

  private readonly restart = (): void => {
    this.engine?.destroy();
    this.engine = null;
    this.begin();
  };

  private begin(): void {
    const settings = this.settings;
    if (!inSeason(settings.from, settings.until)) return;
    const reduce = this.motion.matches && settings.reducedMotion !== 'ignore';
    if (reduce && settings.reducedMotion === 'off') return;
    const start = (): void => {
      if (this.stopped || this.engine) return;
      this.engine = new Engine(this.settings, reduce);
      if (this.paused) this.engine.pause();
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  }
}

/** Start the snow, or update the one already running. Does nothing on a server. */
export function snofetti(options: SnofettiOptions = {}): Snofetti {
  if (!supported()) return IDLE;
  const running = store[SLOT];
  if (running) {
    running.update(options);
    return running;
  }
  return (store[SLOT] = new Controller(options));
}

export default snofetti;

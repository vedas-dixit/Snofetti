export type SnowStyle = 'real' | 'crystal' | 'soft';

export type SnowTarget = 'auto' | string | Element | Iterable<Element>;

export interface SnofettiOptions {
  /** Look of the piled snow. Default: 'real'. */
  style?: SnowStyle;

  /**
   * Which elements collect snow.
   * 'auto' (default) uses every element marked with `data-snow`. If the page has none,
   * it picks buttons, cards, images and similar boxes by itself.
   * A CSS selector or a list of elements uses exactly those.
   */
  target?: SnowTarget;

  /** How much snow is falling. 1 is the default, 0 means no falling snow. */
  density?: number;

  /** How high the piles grow. 1 is the default. */
  depth?: number;

  /** How far the wind pushes the flakes sideways. 1 is the default, 0 means straight down. */
  wind?: number;

  /** How much snow is already lying when the page opens, from 0 to 1. Default: 0.3. */
  prefill?: number;

  /** Pressing a snowy button knocks its snow off, and fast-moving elements shed theirs. Default: true. */
  interactive?: boolean;

  /** First day of the season as 'MM-DD'. Outside the season nothing runs. */
  from?: string;

  /** Last day of the season as 'MM-DD'. May be earlier in the year than `from`, e.g. '12-01' to '01-06'. */
  until?: string;

  /** CSS z-index of the snow. Default: 2147483000. */
  zIndex?: number;

  /** Most piles kept active at the same time. Default: 40. */
  maxSurfaces?: number;

  /**
   * What visitors who asked their system for reduced motion get.
   * 'static' (default): still piles, nothing moves. 'off': no snow. 'ignore': the full effect.
   */
  reducedMotion?: 'static' | 'off' | 'ignore';
}

export interface Snofetti {
  /** True while snow is on the page and not paused. */
  readonly active: boolean;

  /** Hide the snow and stop all work. The piles are kept. */
  pause(): void;

  /** Bring the snow back after `pause()`. */
  resume(): void;

  /** Knock the snow off one element, off every match of a selector, or off everything. */
  shake(target?: Element | string): void;

  /** Change options while it is running. */
  update(options: SnofettiOptions): void;

  /** Remove the snow and everything Snofetti added to the page. */
  stop(): void;
}

import { useEffect } from 'react';
import { snofetti } from './index';
import type { SnofettiOptions } from './types';

export type SnofettiProps = Omit<SnofettiOptions, 'target'> & {
  target?: string;
};

/** Snow for the whole page. Render it once, for example in your root layout. */
export function Snofetti(props: SnofettiProps): null {
  const key = JSON.stringify(props);

  // Started once. Later prop changes update the running snow instead of restarting it.
  useEffect(() => {
    const snow = snofetti(props);
    return () => snow.stop();
  }, []);

  useEffect(() => {
    snofetti(props);
  }, [key]);

  return null;
}

export default Snofetti;

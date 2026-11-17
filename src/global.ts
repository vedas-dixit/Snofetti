import { snofetti } from './index';
import { fromDataset } from './options';

declare global {
  interface Window {
    snofetti: typeof snofetti;
  }
}

// Script-tag build. Starts from the tag's data- attributes unless it has data-manual.
const script = document.currentScript;
window.snofetti = snofetti;

if (!(script instanceof HTMLScriptElement)) snofetti();
else if (script.dataset.manual === undefined) snofetti(fromDataset(script.dataset));

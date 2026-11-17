export interface Layer {
  host: HTMLElement;
  root: ShadowRoot | HTMLElement;
}

function force(el: HTMLElement, styles: Record<string, string>): void {
  for (const [name, value] of Object.entries(styles)) el.style.setProperty(name, value, 'important');
}

// Styles are forced and the canvases live in a shadow root, so page CSS cannot reach
// them. The fixed layer covers the viewport. The other is a zero-size anchor at the
// top of the document, so canvases inside it scroll with the page.
export function createLayer(fixed: boolean, zIndex: number): Layer {
  const host = document.createElement('snofetti-layer');
  host.setAttribute('aria-hidden', 'true');
  force(host, {
    position: fixed ? 'fixed' : 'absolute',
    left: '0',
    top: '0',
    right: 'auto',
    bottom: 'auto',
    width: fixed ? '100%' : '0',
    height: fixed ? '100%' : '0',
    margin: '0',
    padding: '0',
    border: '0',
    background: 'none',
    overflow: fixed ? 'hidden' : 'visible',
    'pointer-events': 'none',
    'z-index': String(zIndex),
    display: 'block',
    transform: 'none',
    filter: 'none',
    opacity: '1',
    visibility: 'visible',
  });
  const root = typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'open' }) : host;
  return { host, root };
}

export function setLayerDepth(layer: Layer, zIndex: number): void {
  force(layer.host, { 'z-index': String(zIndex) });
}

export function showLayer(layer: Layer, visible: boolean): void {
  force(layer.host, { display: visible ? 'block' : 'none' });
}

export function createPileCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const style = canvas.style;
  style.position = 'absolute';
  style.left = '0';
  style.top = '0';
  style.pointerEvents = 'none';
  style.opacity = '0';
  style.transition = 'opacity 0.3s ease';
  return canvas;
}

export function createSkyCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const style = canvas.style;
  style.position = 'absolute';
  style.left = '0';
  style.top = '0';
  style.width = '100%';
  style.height = '100%';
  style.pointerEvents = 'none';
  return canvas;
}

// Runs the demo page in headless Chrome and checks how the snow behaves.
// Set CHROME_PATH if Chrome is not in a usual place. Screenshots go to .tmp/smoke/.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

const chrome = CHROME_PATHS.find((path) => path && existsSync(path));
if (!chrome) {
  console.error('Chrome was not found. Set CHROME_PATH to your Chrome or Chromium binary.');
  process.exit(1);
}
if (!existsSync('dist/snofetti.global.js')) {
  console.error('dist/ is missing. Run "npm run build" first.');
  process.exit(1);
}

const out = resolve('.tmp/smoke');
mkdirSync(out, { recursive: true });
const demo = pathToFileURL(resolve('demo/index.html')).href;
const port = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'snofetti-smoke-'))}`,
  '--force-device-scale-factor=2', '--window-size=1100,800', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

// every pile canvas, where it is on screen and how much snow it holds
const PILES = `(() => {
  const layers = [...document.querySelectorAll('snofetti-layer')];
  const canvases = layers.flatMap((layer) => [...(layer.shadowRoot || layer).querySelectorAll('canvas')]);
  const piles = canvases.filter((c) => c.style.width !== '100%').map((c) => {
    const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
    const data = c.width && c.height ? c.getContext('2d').getImageData(0, 0, c.width, c.height).data : [];
    let snow = 0;
    for (let i = 3; i < data.length; i += 16) if (data[i] > 40) snow++;
    return { left: r.left, top: r.top, bottom: r.bottom, width: r.width, opacity: Number(cs.opacity), display: cs.display, snow };
  });
  return { layers: layers.length, piles };
})()`;

// matches each visible pile to the element it should sit on
const ALIGNMENT = `(() => {
  const { piles } = ${PILES};
  const boxes = [...document.querySelectorAll('button, a.btn, .card, pre, .window, .photo, .dialog, [data-snow]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, inDialog: !!el.closest('.dialog') };
  });
  const seen = piles.filter((p) => p.display !== 'none' && p.opacity > 0.5 && p.bottom > 0 && p.top < innerHeight);
  let aligned = 0, behindDialog = 0;
  for (const p of seen) {
    const box = boxes.find((b) => Math.abs(b.left - p.left) <= 1.5 && Math.abs(b.width - p.width) <= 1.5 && p.top < b.top + 1 && p.bottom > b.top);
    if (box) aligned++;
    if (box && !box.inDialog && box.top > 0 && box.top < innerHeight) behindDialog++;
  }
  return { visible: seen.length, aligned, behindDialog, snow: seen.reduce((sum, p) => sum + p.snow, 0) };
})()`;

try {
  let targets;
  for (let i = 0; i < 80 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await sleep(150);
    }
  }
  if (!targets) throw new Error('Chrome did not start.');

  const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((done) => { socket.onopen = done; });
  let id = 0;
  const waiting = new Map(), problems = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      problems.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      problems.push(`console.${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
  };
  const send = (method, params = {}) => new Promise((done) => {
    const n = ++id;
    waiting.set(n, done);
    socket.send(JSON.stringify({ id: n, method, params }));
  });
  const run = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.result.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description || 'evaluate failed');
    return reply.result.result.value;
  };
  const shot = async (name) => {
    const reply = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(out, `${name}.png`), Buffer.from(reply.result.data, 'base64'));
  };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const open = async (query) => {
    await send('Page.navigate', { url: `${demo}?${query}` });
    await sleep(1800);
  };

  await send('Runtime.enable');
  await send('Page.enable');

  await open('prefill=0.9');
  let state = await run(PILES);
  check('two layers are added to the page', state.layers === 2, `${state.layers} layers`);
  check('piles are created without any markup', state.piles.length >= 6, `${state.piles.length} piles`);
  let fit = await run(ALIGNMENT);
  check('every visible pile sits on its element', fit.visible > 0 && fit.aligned === fit.visible, `${fit.aligned}/${fit.visible}`);
  check('piles hold snow', fit.snow > 500, `${fit.snow} sampled pixels`);
  await shot('1-light');

  const frames = await run(`new Promise((done) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else done(n / 2); }; requestAnimationFrame(tick); })`);
  check('runs at a smooth frame rate', frames > 45, `${frames.toFixed(0)} fps`);

  await run(`window.scrollTo({ top: 420, behavior: 'instant' })`);
  await sleep(500);
  fit = await run(ALIGNMENT);
  check('piles stay on their elements after scrolling', fit.visible > 0 && fit.aligned === fit.visible, `${fit.aligned}/${fit.visible}`);
  const sticky = await run(`(() => { const b = document.querySelector('.nav .btn.primary').getBoundingClientRect(); const { piles } = ${PILES}; return piles.some((p) => p.opacity > 0.5 && Math.abs(p.left - b.left) <= 1.5 && Math.abs(p.width - b.width) <= 1.5 && p.top < b.top + 1 && p.bottom > b.top); })()`);
  check('a button in the sticky header keeps its pile while scrolled', sticky);
  const optedOut = await run(`(() => { const b = document.querySelector('#style button[aria-pressed="true"]').getBoundingClientRect(); const { piles } = ${PILES}; return !piles.some((p) => Math.abs(p.left - b.left) <= 1.5 && Math.abs(p.width - b.width) <= 1.5); })()`);
  check('data-snow="off" keeps snow away from an element', optedOut);
  await shot('2-scrolled');

  await run(`document.getElementById('open').click()`);
  await sleep(900);
  fit = await run(ALIGNMENT);
  check('piles behind an open dialog are hidden', fit.behindDialog === 0, `${fit.behindDialog} still showing`);
  await shot('3-dialog');
  await run(`document.getElementById('close').click()`);
  await sleep(900);
  fit = await run(ALIGNMENT);
  check('piles come back when the dialog closes', fit.visible >= 3 && fit.aligned === fit.visible, `${fit.aligned}/${fit.visible}`);

  await run(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(500);
  const before = (await run(ALIGNMENT)).snow;
  const WINDOW_SNOW = `(() => { const b = document.getElementById('window').getBoundingClientRect(); const { piles } = ${PILES}; const p = piles.find((p) => Math.abs(p.left - b.left) <= 1.5 && Math.abs(p.width - b.width) <= 1.5); return p ? p.snow : -1; })()`;
  const windowBefore = await run(WINDOW_SNOW);
  const box = await run(`(() => { const r = document.getElementById('window').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 16]; })()`);
  await mouse('mousePressed', box[0], box[1]);
  for (let i = 0; i < 14; i++) {
    await mouse('mouseMoved', box[0] + (i % 2 ? -90 : 90), box[1]);
    await sleep(16);
    if (i === 8) await shot('4-shaking');
  }
  await mouse('mouseReleased', box[0], box[1]);
  await sleep(400);
  const windowAfter = await run(WINDOW_SNOW);
  check('shaking an element knocks its snow off', windowBefore > 1000 && windowAfter >= 0 && windowAfter < windowBefore * 0.1, `${windowBefore} -> ${windowAfter}`);

  await run(`snofetti().shake()`);
  await sleep(400);
  const after = (await run(ALIGNMENT)).snow;
  check('shake() clears every pile', after < before * 0.2, `${before} -> ${after}`);

  await run(`snofetti().pause()`);
  const pausedDisplay = await run(`getComputedStyle(document.querySelector('snofetti-layer')).display`);
  check('pause() hides the snow', pausedDisplay === 'none');
  await run(`snofetti().resume()`);
  const resumedDisplay = await run(`getComputedStyle(document.querySelector('snofetti-layer')).display`);
  check('resume() brings it back', resumedDisplay === 'block');

  await run(`document.getElementById('theme').click()`);
  await sleep(1500);
  await shot('5-dark-after-shake');

  await run(`snofetti().stop()`);
  check('stop() removes everything it added', (await run(`document.querySelectorAll('snofetti-layer').length`)) === 0);

  for (const style of ['real', 'crystal', 'soft']) {
    await open(`prefill=0.95&style=${style}&theme=dark`);
    fit = await run(ALIGNMENT);
    check(`${style} style paints on a dark page`, fit.visible > 0 && fit.aligned === fit.visible && fit.snow > 500, `${fit.aligned}/${fit.visible}, ${fit.snow} px`);
    await shot(`6-${style}-dark`);
    await run(`document.getElementById('window').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(700);
    await shot(`7-${style}-window`);
  }

  await open('prefill=0.9');
  await run(`document.getElementById('features').scrollIntoView({ behavior: 'instant' })`);
  await sleep(900);
  fit = await run(ALIGNMENT);
  check('cards and buttons further down the page have piles too', fit.visible >= 4 && fit.aligned === fit.visible, `${fit.aligned}/${fit.visible}`);
  await shot('8-features');

  await open('prefill=0.9&target=.card');
  await run(`document.getElementById('features').scrollIntoView({ behavior: 'instant' })`);
  await sleep(800);
  state = await run(PILES);
  check('a selector limits snow to matching elements', state.piles.length > 0 && state.piles.length <= 5, `${state.piles.length} piles`);

  await open('prefill=0.9');
  await run(`document.querySelector('pre').setAttribute('data-snow', '')`);
  await sleep(3200);
  state = await run(PILES);
  check('marking an element with data-snow limits snow to it', state.piles.length === 1, `${state.piles.length} piles`);

  const day = (offset) => {
    const date = new Date(Date.now() + offset * 86400000);
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const season = (from, until) => run(`(() => { snofetti().stop(); const snow = snofetti({ from: '${from}', until: '${until}' }); const seen = { layers: document.querySelectorAll('snofetti-layer').length, active: snow.active }; snow.stop(); return seen; })()`);
  const closed = await season(day(30), day(40));
  check('outside the season nothing is added to the page', closed.layers === 0 && closed.active === false);
  const opened = await season(day(-1), day(1));
  check('inside the season it starts', opened.layers === 2 && opened.active === true);

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open('');
  const calm = await run(`(() => { const { piles } = ${PILES}; const sky = [...document.querySelectorAll('snofetti-layer')].flatMap((layer) => [...layer.shadowRoot.querySelectorAll('canvas')]).find((c) => c.style.width === '100%'); return { piles: piles.filter((p) => p.snow > 50).length, sky: getComputedStyle(sky).display }; })()`);
  check('reduced motion shows still piles and no falling snow', calm.piles >= 3 && calm.sky === 'none', `${calm.piles} piles, sky ${calm.sky}`);
  await shot('9-reduced-motion');
  await send('Emulation.setEmulatedMedia', { features: [] });

  check('no errors or warnings in the console', problems.length === 0, problems.slice(0, 3).join(' | '));
  socket.close();
} catch (error) {
  console.error(error);
  failures.push('the run itself');
} finally {
  browser.kill();
}

console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
console.log(`Screenshots: ${out}`);
process.exit(failures.length ? 1 : 0);

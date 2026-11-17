---
name: snofetti
description: Add Snofetti to a website so snow falls on the page and piles up on its buttons, cards and images. Use when the user asks for a snow, winter, Christmas or holiday effect on their site, or asks to install or configure Snofetti.
---

# Adding Snofetti to a website

Snofetti is one small library with no dependencies. It needs one line in one place. Do not wrap it in extra components, and do not add CSS for it.

## 1. Find out what the site is built with

Look at `package.json` and the project files before you change anything.

| The project has | Do this |
| --- | --- |
| No build step, plain HTML, WordPress, Shopify, Webflow | Add the script tag before `</body>` in the shared layout or footer. |
| Next.js with an `app/` folder | Run `npm install snofetti`. Render `<Snofetti />` from `snofetti/react` once inside `<body>` in `app/layout.tsx`. |
| Next.js with a `pages/` folder | Run `npm install snofetti`. Render `<Snofetti />` once in `pages/_app.tsx`, next to `<Component />`. |
| Other React (Vite, Remix) | Run `npm install snofetti`. Render `<Snofetti />` once in the root component. |
| Vue or Nuxt | Run `npm install snofetti`. Call `snofetti()` in `onMounted` of the root component and `stop()` in `onUnmounted`. |
| Svelte or SvelteKit | Run `npm install snofetti`. Call `snofetti()` in `onMount` of the root layout and return a function that calls `stop()`. |
| Astro | Run `npm install snofetti`. Add a `<script>` to the base layout that imports `snofetti` and calls it. |

Use the package manager the project already uses (`npm`, `pnpm`, `yarn` or `bun`).

Script tag:

```html
<script defer src="https://cdn.jsdelivr.net/npm/snofetti" data-from="12-01" data-until="01-06"></script>
```

React:

```jsx
import { Snofetti } from 'snofetti/react';

<Snofetti from="12-01" until="01-06" />
```

Everything else:

```js
import { snofetti } from 'snofetti';

const snow = snofetti({ from: '12-01', until: '01-06' });
```

Add it once for the whole site. Never add it per page or per component.

## 2. Set the season

Always set `from` and `until` unless the user asks for snow all year. The format is `'MM-DD'`. A season may run over New Year. If the user does not name dates, use `12-01` to `01-06` and tell them.

Outside the season the library adds nothing to the page, so the line can stay in the code all year.

## 3. Decide where snow piles up

With no instruction, Snofetti picks buttons, cards, images and code blocks by itself. Start with that.

Only step in when the user asks for control or the automatic choice looks wrong:

- Add `data-snow` to the elements that should collect snow. Once any element has it, only marked elements are used. Good choices are the main call-to-action button, hero cards, pricing cards and images. Three to ten elements per screen is plenty.
- Add `data-snow="off"` to an element to keep snow off it and everything inside it. Use this for dense areas such as tables, long lists, toolbars and forms.

Do not pass a `target` selector if `data-snow` attributes will do. Attributes stay correct when class names change.

## 4. Options worth knowing

| Option | Default | Use |
| --- | --- | --- |
| `style` | `'real'` | `'crystal'` for a glassy look with coloured glints, `'soft'` for flat, illustrated designs. |
| `density` | `1` | Lower it (for example `0.5`) on text-heavy pages. `0` stops falling snow but keeps the piles. |
| `depth` | `1` | Height of the piles. |
| `reducedMotion` | `'static'` | Leave it. People who ask for reduced motion get still piles. |

On the script tag these are `data-style`, `data-density`, `data-depth`.

## 5. Check your work

- The site builds and has no new console errors.
- Snofetti is added exactly once.
- If today is outside the season you set, nothing will show. That is correct. To see it, remove the dates for a moment, look, and put them back.

## Do not

- Do not copy the library's source into the project.
- Do not add a canvas, an overlay element or CSS yourself. Snofetti creates what it needs.
- Do not call `snofetti()` during server rendering to "pre-render" snow. It only runs in the browser.
- Do not remove the season dates to make it "work" outside the season.

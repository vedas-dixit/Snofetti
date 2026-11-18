
# Snofetti ❄️

Snow that falls on your website and piles up on buttons, cards, images and other elements.

Add one line and you're done. No dependencies, no setup. You can even tell it when the holiday season starts and ends, and it'll take care of the rest every year.

[Try it live](https://vedas-dixit.github.io/Snofetti/) · [npm](https://www.npmjs.com/package/snofetti)

![Snofetti preview](https://raw.githubusercontent.com/vedas-dixit/Snofetti/main/docs/preview.png)

## Getting started

The easiest way is to add this before `</body>`:

```html
<script defer src="https://cdn.jsdelivr.net/npm/snofetti"
        data-from="12-01" data-until="01-06"></script>
```

That's it. Snow falls from December 1 to January 6, every year.

Or install it with npm:

```bash
npm install snofetti
```

```js
import { snofetti } from 'snofetti';

const snow = snofetti({
  from: '12-01',
  until: '01-06'
});
```

## Made for actual websites

A few things I wanted to get right:

- **Snow actually piles up.** It settles on real page elements instead of just falling across the screen.
- **It stays out of the way.** Buttons remain clickable, menus stay above the snow, and scrolling works normally.
- **A little interaction.** Click a snowy button or shake the window to knock the snow off.
- **Light and dark themes.** Snow adjusts to the page so it doesn't disappear against different backgrounds.
- **Reduced motion.** Respects the user's system preference.
- **Small and dependency-free.** Around 16 kB gzipped.

## Choose your snow

There are three styles:

| Real | Crystal | Soft |
|:---:|:---:|:---:|
| ![Real](https://raw.githubusercontent.com/vedas-dixit/Snofetti/main/docs/style-real.png) | ![Crystal](https://raw.githubusercontent.com/vedas-dixit/Snofetti/main/docs/style-crystal.png) | ![Soft](https://raw.githubusercontent.com/vedas-dixit/Snofetti/main/docs/style-soft.png) |

```js
snofetti({ style: 'crystal' });
```

`real` is the default.

## Choose where snow lands

By default, Snofetti picks suitable elements automatically.

You can also choose them yourself:

```html
<div class="card" data-snow>
  ...
</div>

<nav data-snow="off">
  ...
</nav>
```

Or pass a CSS selector:

```js
snofetti({ target: '.card, .button' });
```

## A little more control

`snofetti()` returns an instance you can control:

```js
const snow = snofetti();

snow.shake();                         // knock off the snow
snow.pause();                         // pause
snow.resume();                        // resume
snow.update({ style: 'soft' });       // change settings
snow.stop();                          // remove everything
```

For more options, framework examples (React, Vue, Svelte and Astro), and advanced configuration, see the [documentation](https://github.com/vedas-dixit/Snofetti).

## Known limitations

This is still an early release (v0.1).

- Tested in Chrome so far.
- Rotated and skewed elements don't get perfectly shaped snow piles.
- Snow collects on top surfaces, not on the sides of elements.

If you run into something weird, feel free to open an issue!

## Development

```bash
npm install
npm run build
npm test
npm run smoke
```

## Licence

[MIT](LICENSE)

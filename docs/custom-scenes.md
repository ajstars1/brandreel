# Custom scenes

When none of the built-in templates fits a moment, write the scene yourself. A custom scene is one JavaScript module plus optional CSS, referenced from `video.json`:

```jsonc
{ "template": "custom", "duration": 5,
  "code": "scenes/orbit.js", "css": "scenes/orbit.css",
  "props": { "headline": ["One place for", "*every clause.*"], "labels": ["Flags", "Questions", "Renewals"] } }
```

`examples/clearclause/scenes/orbit.js` is a complete example (render it with `node dist/cli.js render examples/clearclause/custom.json`).

## The contract

```js
export default function scene(root, api) {
  const { gsap, h, headline, revealLines, brand, duration, motion, props } = api;
  const tl = gsap.timeline();
  root.classList.add('my-scene');                 // scope your CSS under this class
  const title = headline(props.headline ?? ['Hello', '*world.*']);
  root.append(h('div', 'center', title.node));
  revealLines(tl, title.parts, .2);
  return tl;                                       // a timeline starting at 0
}
```

The runtime calls your function **once**, before the first frame, and then seeks the returned timeline to every frame. That is why the rules below exist.

`api` contains:

| Field | What it is |
|---|---|
| `gsap` | The GSAP instance the page uses. `api.gsap.timeline()` is the only way to make the returned timeline. |
| `brand` | The brand block from the video: `name`, `logo` (a URL you can pass to `api.img`), `colors`, `fonts`, `handle`. |
| `duration` | The scene's length in seconds. Tweens that should last the whole scene use it. |
| `layout` | `'landscape'`, `'portrait'` or `'square'`. |
| `motion` | The style pack's motion preset: `enter`, `stagger`, `ease`, `pop`, `drift`. Use these instead of your own numbers so style packs still apply. |
| `props` | The scene's `props` object from `video.json`, untouched. |
| `h(tag, classOrAttrs, ...children)` | Element builder: `h('div', 'a b', …)` or `h('div', { class: 'a b', style: '…' }, …)`. Children may be nodes, strings, or falsy values (skipped). |
| `img(src, className)` | An `<img>`. |
| `markup(text)` | Text with `*accent*` words as a fragment. |
| `headline(lines, sizeClass?)` | The masked, line-by-line headline every template uses. Returns `{ node, parts }`; animate `parts` with `revealLines`. Lines never wrap: the runtime shrinks them to fit. |
| `kicker(text)` | The small label with a dash. |
| `revealLines(tl, parts, at, stagger?)`, `fadeUp(tl, target, at, distance?)`, `popIn(tl, target, at, from?, stagger?)`, `countUp(tl, node, to, format, duration, at)`, `drift(tl, target, duration, amount?)` | The shared animations. |

Layout classes from the base stylesheet are available: `.center`, `.stack`, `.split` (with `.copy` and `.visual`), `.card`, `.caption`, `.kicker`, `.display`, `.h-xl` … `.h-sm`. They respect the safe area on 9:16 and reflow for portrait, so build inside them when you can.

Theme and brand variables to use in CSS or inline styles: `--scene-fg`, `--scene-bg`, `--em`, `--soft`, `--surface`, `--surface-fg`, `--rule`, `--primary`, `--primary-dark`, `--accent`, `--highlight`, `--radius-card`, `--radius-pill`, `--shadow-card`, `--font-display`, `--font-body`, `--font-accent`. Sizes are design pixels: the short side of the frame is always 1080.

## Rules

1. **Deterministic.** No `Math.random`, `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `fetch`, or event listeners. Every change happens through the timeline, so seeking to a time always draws the same frame. If you need variation, derive it from an index or from `props`.
2. **One file, no imports.** The module is loaded on its own; take everything from `api`. (The page serves `gsap` through an import map, but you already have it as `api.gsap`.)
3. **Return the timeline.** It must be an `api.gsap.timeline()`; the runtime places it on the master timeline and speeds it up if it runs longer than the scene.
4. **Scope your CSS.** Add a class to `root` and prefix every selector with it, or the styles leak into other scenes.
5. **Load nothing external.** Images must come from `brand.logo` or a path in `props` that the video lists (the loader only serves files it knows about).

Errors in a custom scene fail the render with the message, so a typo never produces a silent black frame.

## Letting Claude write one

`brandreel write ... --custom` lets the writer emit custom scenes for moments the templates can't express. The code is checked against the rules above, rendered to stills, and shown back to the model for a review round before you see it. See the README.

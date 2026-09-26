# Contributing

Thanks for helping. Small, focused pull requests are easiest to review.

## Setup

```sh
npm install
npm run build && npm test
npm run example                                   # full render of the example
node dist/cli.js stills examples/clearclause/video.json --at 3,10 --format 9:16
```

## Adding a template

A template is a function that fills a full-frame scene element and returns a GSAP timeline starting at 0.

1. **Schema.** Add a zod object with `template: z.literal('your-name')` and `...base` to `src/spec.ts`, and add it to `sceneSchema`. If it takes an image, call the field `image` so the loader registers the file.
2. **Id.** Add the id to `TemplateId` and `DEFAULT_THEME` in `src/constants.ts`. The build fails if the two lists disagree.
3. **Template.** Create `src/runtime/templates/your-name.ts` exporting `const yourName: Template<'your-name'>`, and register it in `templates/index.ts`.
4. **Styles.** Add classes to `static/styles.css`. Use design pixels (short side = 1080), the theme variables (`--scene-fg`, `--em`, `--soft`, `--surface`, `--rule`) and the tokens (`--radius-card`, `--shadow-card`, `--h-lg`…) rather than literal colours and radii, so themes and style packs apply. Add `.portrait` or `.square` overrides if the layout needs them, and keep text inside `.center`, `.stack` or `.split`, which respect the safe area.
5. **Docs.** Add the fields to `docs/templates.md` and a line to the README table and to `TEMPLATE_HELP` in `src/cli.ts`.
6. **Check.** Render stills at 16:9 and 9:16 (with `--guides`) and in at least two style packs, and look at them.

Rules of thumb:

- Timelines must be deterministic. Drive every change through the timeline (no `setTimeout`, `Math.random` or `Date`), so seeking to a time always gives the same frame. Use `countUp` from `dom.ts` for numbers.
- Read the motion preset (`M().enter`, `M().ease`, `M().pop`, `M().stagger`) instead of hardcoding eases, so style packs change the feel of your scene too.
- Put entrances in the first 2 to 3 seconds and add a slow drift so held frames never look frozen. The runtime speeds up a timeline that is longer than its scene.
- Build text with `markup()` or `headline()` so `*accent*` works everywhere, and let `sizeFor()` pick headline sizes.

## Custom scenes vs. new templates

If a scene is useful to one brand, write it as a custom scene (`docs/custom-scenes.md`) and keep it in that brand's folder. Promote it to a built-in template only when a second brand wants it; the template then gets a schema, a default theme and docs like the others.

## Adding a style pack

1. Add the name, its motion preset and default transition to `STYLE_PACKS` in `src/constants.ts`.
2. Create `static/styles/<name>.css`. Override tokens on `#stage` first (`--radius-card`, `--shadow-card`, `--h-xl-base`, `--display-tracking`, `--texture`, `--grain-opacity`…), then theme backgrounds (`.theme-light { --scene-bg: … }`), then individual selectors only where a token cannot express the change.
3. Add a line to `STYLE_HELP` in `src/cli.ts` and to the README table.
4. Render the example in your pack at 16:9 and 9:16: `node dist/cli.js stills examples/clearclause/reel.json --style <name> --at 6,16,26`.

## Commits

Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`.

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

1. **Schema.** Add a zod object with `template: z.literal('your-name')` and `...base` to `src/spec.ts`, and add it to `sceneSchema`.
2. **Id.** Add the id to `TemplateId` and `DEFAULT_THEME` in `src/constants.ts`. The build fails if the two lists disagree.
3. **Template.** Create `src/runtime/templates/your-name.ts` exporting `const yourName: Template<'your-name'>`, and register it in `templates/index.ts`.
4. **Styles.** Add classes to `static/styles.css`. Use design pixels (short side = 1080) and the brand custom properties (`--primary`, `--em`, `--soft`…). Add `.portrait` or `.square` overrides if the layout needs them.
5. **Docs.** Add the fields to `docs/templates.md` and a line to the README table and to `TEMPLATE_HELP` in `src/cli.ts`.
6. **Check.** Render stills at 16:9 and 9:16 and look at them.

Rules of thumb:

- Timelines must be deterministic. Drive every change through the timeline (no `setTimeout`, `Math.random` or `Date`), so seeking to a time always gives the same frame. Use `countUp` from `dom.ts` for numbers.
- Put entrances in the first 2 to 3 seconds and add a slow drift so held frames never look frozen. The runtime speeds up a timeline that is longer than its scene.
- Build text with `markup()` or `headline()` so `*accent*` works everywhere.

## Commits

Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`.

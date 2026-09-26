---
name: brandreel
description: Draft, validate and render brandreel videos from inside Claude Code. Use when asked to make a reel, ad, explainer or video for a brand in this repo, to write a video.json, or to turn a brief into a video. No API key needed: this session does the writing, the CLI does the rest.
---

# brandreel in Claude Code

You are the writer; the CLI validates and renders. Never invent facts: use only the brand kit's `facts` and the brief.

## Draft a video from a brief

1. Find the brand kit: `brands/<name>/brand.json` (private) or `examples/clearclause/brand.json`. If the brand has no kit, make one from its `video.json` (drop `scenes`, add `voice` and `facts`).
2. Get the exact prompt and reply shape:
   `node dist/cli.js write "<brief>" --brand <kit> --kind reel|ad|explainer --length <seconds> --show-prompt` (add `--custom` if bespoke scenes are wanted). Follow the system prompt's template limits and writing rules to the letter.
3. Write the reply JSON (`{ title, slug, scenes }`) to `<kit dir>/drafts/<slug>-reply.json`.
4. Import, validate and render stills:
   `node dist/cli.js write "<brief>" --brand <kit> --from <kit dir>/drafts/<slug>-reply.json --stills [--custom]`
   Fix any validation error it reports in the reply JSON and rerun. Then look at the stills (Read the PNGs) and judge them like a motion designer: text inside the frame, nothing overlapping, one idea per scene. Edit the reply and rerun until they pass.
5. Render: `node dist/cli.js render <kit dir>/drafts/<slug>.json` (add `--format 9:16` for reels). Report the output path.

## Other commands

- `node dist/cli.js templates` and `docs/templates.md`: every template and field.
- `node dist/cli.js batch <series.json> --data rows.csv [--dry-run]`: many videos from rows with `{{placeholders}}`.
- `node dist/cli.js music --mood calm|upbeat|tech --seconds 12 -o music/bed.m4a`: a licence-free background bed.
- `docs/custom-scenes.md`: the contract for a scene written in code (`template: "custom"`).
- Run `npm run build` first if `dist/` is missing or older than `src/`.

## Rules that always apply

- Copy: no em dashes, no emoji, sentence case, short headline lines, one accent phrase per scene.
- Claims: only the kit's facts and the brief. If a stat is not in the facts, do not use `stat` or `counter`.
- Private brand kits stay in `brands/`, which is gitignored. Never commit them.

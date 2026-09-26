# brandreel

**Branded motion-graphics videos from a JSON script.**
Write your brand kit and a list of scenes, then render a crisp MP4 in 16:9, 9:16, 1:1 or 4:5.

<p align="center"><img src="docs/demo.gif" width="720" alt="Clearclause example video"></p>

```sh
npx brandreel render video.json                 # → out/video-16x9.mp4
npx brandreel render video.json --format 9:16   # same script, Reels/Shorts layout
```

- **Script, not timeline.** A video is a `video.json`: your brand (colours, fonts, logo) plus scenes like `statement`, `chat`, `counter`, `doc-scan`, `end-card`. No editor, no keyframes.
- **One script, every format.** Templates reflow for landscape, portrait and square.
- **Frame-exact.** Scenes are HTML + [GSAP](https://gsap.com) timelines. The renderer seeks to every frame and screenshots it, so nothing is dropped or recorded in real time.
- **Fast.** Frames are split across parallel headless Chrome workers and joined without re-encoding. A 33-second 1080p video renders in about a minute on 4 cores.
- **Local.** Nothing is uploaded. You need Node 20+, FFmpeg, and Chrome or Chromium.

<p align="center"><img src="docs/portrait.jpg" width="400" alt="The same script rendered at 9:16"></p>

## Quick start

```sh
git clone https://github.com/ajstars1/brandreel && cd brandreel
npm install
npm run example          # renders examples/clearclause/video.json
```

Commands:

```sh
brandreel render   <video.json> [-o out.mp4] [--format 16:9|9:16|1:1|4:5] [--workers N]
brandreel preview  <video.json> [--port 4400]      # live looping preview in the browser
brandreel stills   <video.json> --at 1,4.5,9       # PNG frames for quick checks
brandreel validate <video.json>                    # schema check with readable errors
brandreel templates                                # list scene templates
```

brandreel finds Chrome automatically. Set `BRANDREEL_CHROME=/path/to/chrome` to pick one, or run `npx playwright-core install chromium`.

## video.json

```jsonc
{
  "format": "16:9",            // 16:9 | 9:16 | 1:1 | 4:5
  "fps": 30,
  "transition": "wipe",        // wipe | fade | cut
  "audio": { "src": "music.mp3", "volume": 0.8, "fadeOut": 1.5 },   // optional
  "brand": {
    "name": "Clearclause",
    "logo": "logo.svg",
    "logoMotion": "pop",       // pop | spin (for round or pinwheel marks)
    "colors": { "primary": "#1f5eff", "primaryDark": "#0b1f66", "accent": "#7fb2ff", "highlight": "#c6f36b" },
    "fonts": {
      "display": { "family": "Anton", "uppercase": true, "files": [{ "src": "fonts/Anton.woff2" }] },
      "body":    { "family": "Poppins", "files": [{ "src": "fonts/Poppins-Regular.woff2", "weight": 400 }] },
      "accent":  { "family": "Instrument Serif", "files": [{ "src": "fonts/InstrumentSerif-Italic.woff2", "style": "italic" }] }
    }
  },
  "scenes": [
    { "template": "statement", "duration": 3.8, "lines": ["You signed", "the contract.", "*Then you read it.*"] },
    { "template": "end-card", "duration": 4, "tagline": "Know what you *sign.*", "cta": "Try it free" }
  ]
}
```

Paths are relative to the `video.json`. Wrap words in `*asterisks*` to set them in the accent font and colour. A line that is entirely accent becomes a smaller italic line under the headline. Optional colours (`ink`, `paper`, `night`, `positive`, `warning`, `negative`) have sensible defaults.

Every scene takes `duration` (seconds) and an optional `theme` (`light`, `dark` or `brand`). See [docs/templates.md](docs/templates.md) for each template's fields.

| Template | What it shows |
|---|---|
| `statement` | Bold headline lines, optionally beside a card that gets stamped |
| `strike` | A line gets crossed out, then the real point lands |
| `logo-reveal` | Logo pops or spins in with ripples, wordmark and tagline |
| `chat` | A question typed to your assistant, an answer, scored results |
| `counter` | A big number counts up over a drifting wall of cards |
| `doc-scan` | A document is scanned and findings pop out beside it |
| `steps` | Headline beside a numbered path that fills in |
| `end-card` | Logo lockup, tagline, call to action, fine print |

## How it works

1. `load.ts` validates the script with [zod](https://zod.dev) and maps local assets to URLs.
2. `server.ts` serves a page with the runtime, GSAP, the stylesheet and your assets on `127.0.0.1`.
3. The runtime (`src/runtime/`) builds each scene's DOM and GSAP timeline and chains them on one paused master timeline with transitions.
4. `render.ts` opens one headless Chrome per worker. Each worker seeks the timeline to each of its frames, captures it, and pipes PNGs into its own FFmpeg segment. The segments are concatenated without re-encoding, and the audio is mixed in with a fade-out.

All layout is authored at a 1080px short side, so the same template scales cleanly to every format.

## Private brand kits

Put client work in `brands/<name>/video.json`. The folder is gitignored, so commercial fonts and client logos never end up in the repo.

## Development

```sh
npm run build       # tsc for the CLI and the browser runtime
npm run typecheck
npm test            # vitest
```

See [CONTRIBUTING.md](CONTRIBUTING.md) to add a template.

## Licence

MIT. GSAP is installed from npm under its own [standard licence](https://gsap.com/standard-license). The example fonts are under the SIL Open Font License (see `examples/clearclause/fonts/OFL.txt`). Clearclause is a fictional brand.

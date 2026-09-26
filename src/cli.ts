#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { fillTemplate, loadRows, placeholders, rowName } from './batch.js';
import { MOODS, writeMusic, type Mood } from './music.js';
import { BACKENDS, DEFAULT_MODELS, NO_BACKEND_HELP, createWriter, detectBackend, type Backend } from './writers/index.js';
import { describeAnthropicError, isAnthropicAuthError } from './writers/anthropic.js';
import { applyLook, assemble, draftSchema, loadKit, lookPrompt, lookSample, relocateAssets, reviewCustomScenes, slugify, systemPrompt, userPrompt, writeLook, writeVideo, LOOK_SYSTEM, type Kind, type Writer } from './write.js';
import { info, progress, warn } from './log.js';
import { loadProject, loadProjectFrom, SpecError } from './load.js';
import { totalDuration as videoLength } from './spec.js';
import { renderStills, renderVideo } from './render.js';
import { startServer } from './server.js';
import { FORMATS, STYLE_PACK_NAMES, totalDuration, type FormatName, type StylePackName } from './spec.js';

const HELP = `brandreel: branded motion videos from a JSON script

Usage
  brandreel render   <video.json> [-o out.mp4] [--format 16:9|9:16|1:1|4:5] [--style bold|editorial|soft|tech] [--workers N]
  brandreel batch    <series.json> --data rows.csv|rows.json [--format ...] [--out dir]
                     [--only 1,4-6] [--name "{{id}}"] [--dry-run]
  brandreel write    "<brief>" --brand brand.json [--kind reel|ad|explainer] [--length 15]
                     [--format ...] [--style ...] [--via anthropic|gemini|claude-code] [--model ...]
                     [-o video.json] [--stills] [--custom] [--qa 1] [--show-prompt] [--from draft.json]
  brandreel look     "<description>" --brand brand.json [--via ...] [--model ...] [--stills] [--show-prompt]
  brandreel music    --mood calm|upbeat|tech --seconds 15 [--bpm 90] [--key C] [--seed 1] -o bed.m4a
  brandreel stills   <video.json> --at 1,4.5,9 [--out dir] [--format ...] [--guides]
  brandreel preview  <video.json> [--port 4400] [--format ...] [--guides]
  brandreel validate <video.json>
  brandreel templates
  brandreel styles

Needs FFmpeg on PATH and Chrome/Chromium (or BRANDREEL_CHROME=/path/to/chrome).
"write" and "look" need a model: ANTHROPIC_API_KEY, GEMINI_API_KEY, or a logged-in Claude Code CLI
(picked automatically, or with --via). Without any, use --show-prompt and --from.`;

const TEMPLATE_HELP: Record<string, string> = {
  'statement': 'Bold headline lines, optionally beside a card that gets stamped',
  'strike': 'A line gets crossed out, then the real point lands',
  'logo-reveal': 'Logo pops or spins in with ripples, wordmark and tagline',
  'chat': 'Question typed to your assistant, answer, scored results',
  'counter': 'Big number counts up over a drifting wall of cards',
  'doc-scan': 'Document is scanned and findings pop out beside it',
  'steps': 'Headline beside a numbered path that fills in',
  'end-card': 'Logo lockup, tagline, call to action, fine print',
  'hook': 'One line, word by word, as big as it fits (the first second of a reel)',
  'tip': 'Kicker, headline, short body, optional note',
  'myth-fact': 'A myth is crossed out, then the fact lands',
  'stat': 'One number counts up: "57%", "₹3,40,000", "3x"',
  'quote': 'Testimonial or quote, revealed at speaking pace, with author',
  'list': '"Top 5": title beside items that arrive one at a time',
  'versus': 'Two columns, the old way vs the better way, with a VS badge',
  'media': 'A photo with a slow push-in and the headline over a shade',
  'custom': 'Your own scene: a JS module with the same helpers the built-ins use (docs/custom-scenes.md)'
};
const STYLE_HELP: Record<string, string> = {
  bold: 'Big condensed headlines, deep shadows, snappy motion (default)',
  editorial: 'Calm and typographic: flat backgrounds, hairlines, slow fades',
  soft: 'Rounded, pastel, bouncy: consumer apps, wellness, education',
  tech: 'Sharp corners, faint grid, glowing accents, quick cuts'
};

// "1,4-6" → [0, 3, 4, 5]
const parseOnly = (value: string, count: number): number[] => {
  const picked = new Set<number>();
  for (const part of value.split(',')) {
    const [from, to] = part.split('-').map(Number);
    if (!Number.isFinite(from)) continue;
    for (let n = from as number; n <= (Number.isFinite(to) ? (to as number) : (from as number)); n++) if (n >= 1 && n <= count) picked.add(n - 1);
  }
  return [...picked].sort((a, b) => a - b);
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(0)}s`;

type Values = Record<string, string | boolean | undefined>;

// Which model backend to use for write/look, and a readable message when a call fails.
function pickBackend(values: Values): Backend | null {
  const via = values['via'] as string | undefined;
  if (via) {
    if (!(BACKENDS as string[]).includes(via)) { warn(`--via must be one of ${BACKENDS.join(', ')}.`); return null; }
    return via as Backend;
  }
  const detected = detectBackend();
  if (!detected) warn(NO_BACKEND_HELP);
  return detected;
}
function explainModelError(backend: Backend, error: unknown): string {
  if (backend === 'anthropic') {
    if (isAnthropicAuthError(error)) return 'No Anthropic credentials. Set ANTHROPIC_API_KEY (or run `ant auth login`), or use --via gemini / --via claude-code.';
    const described = describeAnthropicError(error);
    if (described) return described;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (backend === 'gemini' && /API key|credential|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) return `Gemini rejected the credentials: ${message}. Set GEMINI_API_KEY.`;
  if (backend === 'gemini' && /not found|NOT_FOUND|is not supported/i.test(message)) return `Gemini error: ${message}. Try another model with --model (for example gemini-3.1-pro-preview).`;
  return `${backend} error: ${message}`;
}

// write: brief + brand kit → Claude drafts scenes → validated video.json (+ optional stills)
async function write(brief: string | undefined, values: Values): Promise<number> {
  const kitPath = values['brand'] as string | undefined;
  if (!brief || !kitPath) { warn('Usage: brandreel write "<brief>" --brand brands/<name>/brand.json'); return 1; }
  const kind = (values['kind'] as string | undefined) ?? 'reel';
  if (!['reel', 'ad', 'explainer'].includes(kind)) { warn(`--kind must be reel, ad or explainer, not ${kind}.`); return 1; }
  if (values['format'] && !(String(values['format']) in FORMATS)) { warn(`Unknown format ${String(values['format'])}. Use ${Object.keys(FORMATS).join(', ')}.`); return 1; }
  const { kit, dir } = await loadKit(kitPath);
  const format = ((values['format'] as string | undefined) ?? (kind === 'reel' ? '9:16' : '16:9')) as FormatName;
  const seconds = Number(values['length'] ?? (kind === 'reel' ? 15 : kind === 'ad' ? 30 : 45));
  const style = values['style'] as StylePackName | undefined;
  const allowCustom = Boolean(values['custom']);
  const rounds = values['qa'] !== undefined ? Number(values['qa']) : allowCustom ? 1 : 0;
  const input = { brief, kind: kind as Kind, format, seconds, style, kit, allowCustom };

  if (values['show-prompt']) {
    info(`--- system ---\n${systemPrompt(allowCustom)}\n\n--- user ---\n${userPrompt(input)}\n\n--- reply shape ---\n{ "title": "...", "slug": "...", "scenes": [ { "template": "hook", "duration": 3, "text": "..." }, ... ] }`);
    return 0;
  }

  let outcome;
  const backend = values['from'] ? null : pickBackend(values);
  if (!values['from'] && !backend) return 1;
  if (values['from']) {
    // A draft produced elsewhere (any model, or by hand): same coercion, validation and save path.
    const parsed = draftSchema.safeParse(JSON.parse(await readFile(String(values['from']), 'utf8')));
    if (!parsed.success) { warn(`${String(values['from'])} is not a draft: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`); return 1; }
    const { project, video, files } = await assemble(kit, dir, parsed.data, input, String(values['from']));
    outcome = { project, video, draft: parsed.data, attempts: 0, usage: { input: 0, output: 0 }, files };
  } else {
    const chosen = backend as Backend;
    const model = (values['model'] as string | undefined) ?? DEFAULT_MODELS[chosen];
    try {
      const writer: Writer = createWriter(chosen, model);
      info(`Drafting a ${seconds}s ${kind} at ${format} via ${chosen}${model ? ` (${model})` : ''}${allowCustom ? ', custom scenes allowed' : ''}…`);
      outcome = await writeVideo(writer, input, dir);
      const customCount = outcome.draft.scenes.filter(scene => scene.template === 'custom').length;
      if (customCount && rounds > 0) {
        info(`Reviewing ${customCount} custom scene${customCount > 1 ? 's' : ''} (${rounds} round${rounds > 1 ? 's' : ''})…`);
        const slug = slugify(outcome.draft.slug || outcome.draft.title);
        const review = await reviewCustomScenes(writer, outcome, { rounds, stills: renderStills, directory: path.join(dir, 'drafts', slug, 'review'), input, kit, kitDir: dir });
        review.notes.forEach(note => info(`  ${note}`));
        outcome = review.outcome;
      }
    } catch (error) {
      if (error instanceof SpecError) throw error;
      warn(explainModelError(chosen, error));
      return 1;
    }
  }

  const slug = slugify(outcome.draft.slug || outcome.draft.title);
  const output = (values['output'] as string | undefined) ?? path.join(dir, 'drafts', `${slug}.json`);
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(relocateAssets(outcome.video, dir, path.dirname(path.resolve(output))), null, 2) + '\n');
  const scenes = outcome.project.video.scenes;
  info(`✓ ${outcome.draft.title}  (${scenes.length} scenes, ${videoLength(outcome.project.video).toFixed(1)}s${outcome.attempts ? `, ${outcome.attempts} draft${outcome.attempts > 1 ? 's' : ''}, ${outcome.usage.input + outcome.usage.output} tokens` : ''})`);
  scenes.forEach((scene, index) => {
    const record = scene as unknown as Record<string, unknown>;
    const saved = (outcome.video['scenes'] as Record<string, unknown>[] | undefined)?.[index];
    const first = scene.template === 'custom' ? `custom scene (${String(saved?.['code'] ?? scene.code)})`
      : ['text', 'headline', 'lines', 'title', 'tagline', 'before', 'myth', 'value', 'question', 'docTitle'].map(key => record[key]).find(value => typeof value === 'string' || Array.isArray(value))
      ?? Object.entries(record).find(([key, value]) => !['template', 'duration', 'theme'].includes(key) && typeof value === 'string')?.[1];
    const preview = Array.isArray(first) ? first.join(' / ') : typeof first === 'string' ? first : '';
    info(`  ${String(index + 1).padStart(2)}. ${scene.template.padEnd(12)} ${scene.duration.toFixed(1).padStart(4)}s  ${preview.slice(0, 70)}`);
  });
  info(`→ ${output}`);
  if (values['stills']) {
    let at = 0;
    const times = scenes.map(scene => { const mid = at + scene.duration * .6; at += scene.duration; return Number(mid.toFixed(2)); });
    const files = await renderStills(outcome.project, times, path.join(path.dirname(path.resolve(output)), slug));
    info(`Stills: ${path.dirname(files[0] ?? '')}`);
  }
  info(`Next: brandreel preview ${output}   ·   brandreel render ${output}`);
  return 0;
}

// look: a description of the look → look.css + themes in the brand kit (+ sample stills)
async function look(description: string | undefined, values: Values): Promise<number> {
  const kitPath = values['brand'] as string | undefined;
  if (!description || !kitPath) { warn('Usage: brandreel look "<description of the look>" --brand brands/<name>/brand.json'); return 1; }
  const { kit, dir } = await loadKit(kitPath);
  if (values['show-prompt']) { info(`--- system ---\n${LOOK_SYSTEM}\n\n--- user ---\n${lookPrompt(kit, description)}`); return 0; }
  const backend = pickBackend(values);
  if (!backend) return 1;
  const model = (values['model'] as string | undefined) ?? DEFAULT_MODELS[backend];
  let result;
  try {
    const writer: Writer = createWriter(backend, model);
    info(`Designing a look for ${(kit as { brand?: { name?: string } }).brand?.name ?? 'the brand'} via ${backend}${model ? ` (${model})` : ''}…`);
    result = await writeLook(writer, kit, description);
  } catch (error) {
    if (error instanceof SpecError) throw error;
    warn(explainModelError(backend, error));
    return 1;
  }
  const cssFile = path.join(dir, 'look.css');
  await writeFile(cssFile, result.look.css.endsWith('\n') ? result.look.css : `${result.look.css}\n`);
  const nextKit = applyLook(kit, result.look);
  await writeFile(path.resolve(kitPath), JSON.stringify(nextKit, null, 2) + '\n');
  info(`✓ look.css written and ${kitPath} updated (style: ${result.look.extends} + look.css${result.look.themes.length ? `, themes: ${result.look.themes.map(theme => theme.name).join(', ')}` : ''}; ${result.usage.input + result.usage.output} tokens)`);
  info(`  ${result.look.notes}`);
  if (values['stills']) {
    const sample = lookSample(nextKit);
    const { project } = await assemble(nextKit, dir, sample, { format: (values['format'] as FormatName | undefined) ?? '9:16' }, 'look sample');
    let at = 0;
    const times = sample.scenes.map(scene => { const mid = at + scene.duration * .6; at += scene.duration; return Number(mid.toFixed(2)); });
    const files = await renderStills(project, times, path.join(dir, 'drafts', 'look-sample'));
    info(`Sample stills: ${path.dirname(files[0] ?? '')}`);
  }
  return 0;
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' }, format: { type: 'string' }, style: { type: 'string' }, workers: { type: 'string' },
      at: { type: 'string' }, out: { type: 'string' }, port: { type: 'string' }, guides: { type: 'boolean' },
      data: { type: 'string' }, only: { type: 'string' }, name: { type: 'string' }, 'dry-run': { type: 'boolean' },
      brand: { type: 'string' }, kind: { type: 'string' }, length: { type: 'string' }, model: { type: 'string' }, via: { type: 'string' },
      mood: { type: 'string' }, seconds: { type: 'string' }, bpm: { type: 'string' }, key: { type: 'string' }, seed: { type: 'string' },
      stills: { type: 'boolean' }, 'show-prompt': { type: 'boolean' }, from: { type: 'string' }, custom: { type: 'boolean' }, qa: { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  });
  const [command, spec] = positionals;
  if (!command || values.help) { info(HELP); return 0; }
  if (command === 'write') return write(spec, values);
  if (command === 'look') return look(spec, values);
  if (command === 'music') {
    const mood = (values.mood ?? 'calm') as Mood;
    if (!MOODS.includes(mood)) { warn(`--mood must be one of ${MOODS.join(', ')}.`); return 1; }
    const seconds = Number(values.seconds ?? 15);
    if (!(seconds > 0 && seconds <= 600)) { warn('--seconds must be between 1 and 600.'); return 1; }
    const output = values.output ?? `music/${mood}-${seconds}s.m4a`;
    await writeMusic({ mood, seconds, bpm: values.bpm ? Number(values.bpm) : undefined, key: values.key, seed: values.seed ? Number(values.seed) : undefined }, output);
    info(`✓ ${output}  (${mood}, ${seconds}s). Add to a video: "audio": { "src": "${output}", "volume": 0.6 }`);
    return 0;
  }
  if (command === 'templates') {
    for (const [name, description] of Object.entries(TEMPLATE_HELP)) info(`  ${name.padEnd(12)} ${description}`);
    return 0;
  }
  if (command === 'styles') {
    for (const name of STYLE_PACK_NAMES) info(`  ${name.padEnd(12)} ${STYLE_HELP[name]}`);
    return 0;
  }
  if (!spec) { warn(`Missing <video.json>.\n\n${HELP}`); return 1; }
  if (values.format && !(values.format in FORMATS)) { warn(`Unknown format ${values.format}. Use ${Object.keys(FORMATS).join(', ')}.`); return 1; }
  if (values.style && !(STYLE_PACK_NAMES as string[]).includes(values.style)) { warn(`Unknown style ${values.style}. Use ${STYLE_PACK_NAMES.join(', ')}.`); return 1; }
  const format = values.format as FormatName | undefined;
  const style = values.style as StylePackName | undefined;
  const workers = values.workers ? Number(values.workers) : undefined;

  if (command === 'batch') {
    if (!values.data) { warn('Give the rows with --data rows.csv (or rows.json).'); return 1; }
    const series: unknown = JSON.parse(await readFile(spec, 'utf8'));
    const rows = await loadRows(values.data);
    if (!rows.length) { warn(`${values.data} has no rows.`); return 1; }
    const columns = placeholders(series);
    const first = rows[0] ?? {};
    const unknown = columns.filter(column => !(column in first));
    if (unknown.length) warn(`Note: ${values.data} has no column named ${unknown.map(c => `"${c}"`).join(', ')}. Rows that need it will fail unless the placeholder is optional ({{${unknown[0]}?}}).`);
    const picked = values.only ? parseOnly(values.only, rows.length) : rows.map((_, index) => index);
    const outDir = values.out ?? path.join(path.dirname(spec), 'out');
    const baseDir = path.dirname(path.resolve(spec));
    let failed = 0;
    const started = Date.now();
    for (const index of picked) {
      const row = rows[index] ?? {};
      const label = `row ${index + 1}`;
      const name = rowName(row, index, values.name);
      try {
        const project = await loadProjectFrom(fillTemplate(series, row, label), baseDir, `${label} (${name})`, { format, style });
        const length = totalDuration(project.video);
        const output = path.join(outDir, `${name}-${project.video.format.replace(':', 'x')}.mp4`);
        if (values['dry-run']) { info(`✓ ${label.padEnd(7)} ${name}: ${project.video.scenes.length} scenes, ${length.toFixed(1)}s → ${output}`); continue; }
        const begun = Date.now();
        await renderVideo(project, { output, workers, onProgress: (done, total) => progress(`${label}/${rows.length} ${name}: ${Math.floor(done / total * 100)}%`) });
        progress('');
        info(`✓ ${label.padEnd(7)} ${output}  (${length.toFixed(1)}s, ${seconds(Date.now() - begun)})`);
      } catch (error) {
        failed++;
        progress('');
        warn(`✗ ${label.padEnd(7)} ${error instanceof SpecError ? error.message : error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!values['dry-run']) info(`${picked.length - failed}/${picked.length} rendered in ${seconds(Date.now() - started)}${failed ? `, ${failed} failed` : ''}`);
    return failed ? 1 : 0;
  }

  const project = await loadProject(spec, { format, style });
  const length = totalDuration(project.video);
  const guides = values.guides ? '?guides' : '';

  switch (command) {
    case 'validate':
      info(`✓ ${spec}: ${project.video.scenes.length} scenes, ${length.toFixed(1)}s, ${project.video.format} at ${project.video.fps}fps, style ${project.video.style.extends}`);
      return 0;
    case 'preview': {
      const server = await startServer(project, Number(values.port ?? 4400));
      info(`Previewing ${spec} at ${server.url}${guides}  (space pauses, Ctrl+C stops)`);
      await new Promise(() => undefined);
      return 0;
    }
    case 'stills': {
      const times = (values.at ?? '').split(',').map(Number).filter(Number.isFinite);
      if (!times.length) { warn('Give times with --at 1,4.5,9'); return 1; }
      const files = await renderStills(project, times, values.out ?? path.join(path.dirname(spec), 'out'), { guides: Boolean(values.guides) });
      files.forEach(file => info(file));
      return 0;
    }
    case 'render': {
      const base = path.basename(spec, path.extname(spec));
      const output = values.output ?? path.join(path.dirname(spec), 'out', `${base}-${project.video.format.replace(':', 'x')}.mp4`);
      const started = Date.now();
      await renderVideo(project, { output, workers, onProgress: (done, total) => progress(`Rendering ${done}/${total} frames (${Math.floor(done / total * 100)}%)`) });
      progress('');
      info(`✓ ${output}  (${length.toFixed(1)}s video, rendered in ${seconds(Date.now() - started)})`);
      return 0;
    }
    default:
      warn(`Unknown command ${command}.\n\n${HELP}`);
      return 1;
  }
}

main().then(code => { process.exitCode = code; }, (error: unknown) => {
  warn(error instanceof SpecError ? error.message : `brandreel: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

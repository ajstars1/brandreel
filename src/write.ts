import type Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_THEME, STYLE_PACK_NAMES, type TemplateId } from './constants.js';
import { loadProjectFrom, SpecError, type Project } from './load.js';
import type { FormatName, StylePackName } from './spec.js';

// `brandreel write`: a brief plus a brand kit becomes a validated video.json. Claude drafts
// the scenes as structured output; the draft is coerced into scene objects and run through
// the same loader as a hand-written script, and validation errors go back to the model for
// one or two repair rounds. With --custom the model may also write scene code, which is
// linted, rendered to stills and reviewed by the model before it reaches the user.
// `brandreel look` uses the same machinery to draft a brand's own style pack.

export const DEFAULT_MODEL = 'claude-opus-5';
export const TEMPLATE_IDS = Object.keys(DEFAULT_THEME) as [TemplateId, ...TemplateId[]];
export type Kind = 'reel' | 'ad' | 'explainer';

// ---- Brand kit: a video.json without scenes, plus voice and facts for the writer ----
const voiceSchema = z.object({
  audience: z.string().optional(),
  tone: z.string().optional(),
  rules: z.array(z.string()).default([]),
  cta: z.string().optional(),
  avoid: z.array(z.string()).default([])
});
const kitSchema = z.looseObject({
  voice: voiceSchema.optional(),
  facts: z.array(z.string()).default([])
});
export type Kit = z.infer<typeof kitSchema>;

export async function loadKit(file: string): Promise<{ kit: Kit; dir: string }> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw new SpecError(`Cannot read brand kit ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  const parsed = kitSchema.safeParse(raw);
  if (!parsed.success) throw new SpecError(`${file} is not a brand kit: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  if (!(parsed.data as Record<string, unknown>)['brand']) throw new SpecError(`${file} has no "brand" section. A brand kit is a video.json without "scenes", plus optional "voice" and "facts".`);
  return { kit: parsed.data, dir: path.dirname(path.resolve(file)) };
}

// ---- What the model returns: one flat scene shape, coerced per template afterwards ----
const side = z.object({ label: z.string(), items: z.array(z.string()) });
const draftScene = z.object({
  template: z.enum(TEMPLATE_IDS),
  duration: z.number(),
  theme: z.string().optional(),
  text: z.string().optional(), kicker: z.string().optional(), body: z.string().optional(), note: z.string().optional(),
  before: z.string().optional(), after: z.string().optional(),
  tagline: z.string().optional(), cta: z.string().optional(), fineprint: z.string().optional(),
  question: z.string().optional(), answer: z.string().optional(), assistant: z.string().optional(),
  myth: z.string().optional(), fact: z.string().optional(), mythLabel: z.string().optional(), factLabel: z.string().optional(),
  label: z.string().optional(), source: z.string().optional(), prefix: z.string().optional(), suffix: z.string().optional(),
  docLabel: z.string().optional(), docTitle: z.string().optional(),
  author: z.string().optional(), role: z.string().optional(), image: z.string().optional(), caption: z.string().optional(),
  headline: z.array(z.string()).optional(), lines: z.array(z.string()).optional(),
  items: z.array(z.string()).optional(), steps: z.array(z.string()).optional(),
  title: z.union([z.string(), z.array(z.string())]).optional(),
  value: z.union([z.string(), z.number()]).optional(),
  numbered: z.boolean().optional(),
  results: z.array(z.object({ name: z.string(), tags: z.array(z.string()).optional(), score: z.number().optional() })).optional(),
  flags: z.array(z.object({ text: z.string(), tone: z.enum(['warn', 'ok', 'bad']).optional() })).optional(),
  card: z.object({ label: z.string(), value: z.string(), stamp: z.string().optional() }).optional(),
  left: side.optional(), right: side.optional(),
  code: z.string().optional(),   // custom scenes only: the JS module source
  css: z.string().optional()     // custom scenes only: scoped CSS
});
export const draftSchema = z.object({
  title: z.string(),
  slug: z.string(),
  scenes: z.array(draftScene)
});
export type Draft = z.infer<typeof draftSchema>;
export type DraftScene = z.infer<typeof draftScene>;

// Turns the flat draft into real scene objects: drops empty fields and fixes the two fields
// whose type depends on the template (`value`, `title`). Custom scene code is handled by
// assemble(), which writes it to disk first.
export function scenesFromDraft(draft: Draft): Record<string, unknown>[] {
  return draft.scenes.map(scene => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scene)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (key === 'code' || key === 'css') continue;
      out[key] = value;
    }
    if (scene.template === 'counter' && scene.value !== undefined) out['value'] = Math.round(Number(String(scene.value).replace(/[^\d.-]/g, '')) || 0);
    if (scene.template === 'stat' && scene.value !== undefined) out['value'] = String(scene.value);
    if (scene.template === 'list' && typeof scene.title === 'string') out['title'] = [scene.title];
    if (scene.template === 'versus' && Array.isArray(scene.title)) out['title'] = scene.title.join(' ');
    return out;
  });
}

// ---- Custom scene code: static checks before anything runs ----
const FORBIDDEN: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random (frames must be deterministic; derive variation from an index)'],
  [/\bDate\b/, 'Date (frames must be deterministic)'],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\b/, 'timers or requestAnimationFrame (drive everything through the timeline)'],
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/, 'network access'],
  [/\baddEventListener\b/, 'event listeners'],
  [/^\s*import\s+[^(]/m, 'import statements (take everything from api)'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [/\beval\s*\(|\bnew\s+Function\b/, 'eval or new Function'],
  [/\blocalStorage\b|\bsessionStorage\b|\bdocument\.cookie\b/, 'storage or cookies']
];

export function lintSceneCode(code: string): string[] {
  const problems: string[] = [];
  if (!/export\s+default\s+(async\s+)?function|export\s+default\s*\(|export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/m.test(code)) problems.push('must `export default function (root, api)`');
  if (/export\s+default\s+async/.test(code)) problems.push('the scene function must be synchronous');
  if (!/timeline\s*\(/.test(code)) problems.push('must create and return api.gsap.timeline()');
  for (const [pattern, why] of FORBIDDEN) if (pattern.test(code)) problems.push(`must not use ${why}`);
  return problems;
}

export function lintSceneCss(css: string): string[] {
  const problems: string[] = [];
  if (/@import\b/.test(css)) problems.push('CSS must not use @import');
  if (/url\s*\(\s*['"]?\s*https?:/.test(css)) problems.push('CSS must not load external URLs');
  return problems;
}

// ---- Prompts ----
const TEMPLATE_GUIDE = `hook: text (one line, up to 9 words, may hold one *accent* phrase), kicker?. 2.5 to 3.5 s. The first scene of a reel.
tip: kicker?, headline (1 to 3 lines, up to 3 words each), body? (up to 25 words), note?. 4.5 to 6 s.
myth-fact: kicker?, myth, fact (up to 14 words each). 4.5 to 5.5 s.
stat: kicker?, value (a string like "57%" or "₹3,40,000"), label (up to 12 words), source?. 3.5 to 4.5 s. Only with a number from the facts or the brief.
quote: text (up to 30 words), author, role?. 4 to 6 s. Only when the brief supplies a real quote.
list: title (1 to 2 lines), items (2 to 6, up to 4 words each), numbered?. 4.5 to 6 s.
versus: title?, left {label, items 2 to 4}, right {label, items 2 to 4} (up to 5 words each). 4.5 to 6 s.
media: image (only a path the brief supplies), headline (1 to 2 lines), caption?. 3.5 to 5 s.
statement: lines (1 to 3, up to 3 words each; a last line wrapped in *accent* becomes an italic sub-line), card? {label, value, stamp?}. 3.5 to 4.5 s.
strike: before, after (up to 8 words each; put *accent* on the key word of "after"). 3.5 to 4 s.
logo-reveal: tagline? (up to 10 words). 3 to 4 s. The brand name and logo are added automatically.
chat: headline (1 to 3 lines), caption?, assistant (the product's name), question (up to 16 words), answer (up to 18 words), results (2 to 3 {name, tags: up to 2 short, score 80 to 98}). 5.5 to 6.5 s.
counter: value (an integer), prefix?, suffix?, title (up to 8 words), subtitle?. 3.5 to 4.5 s. Only with a number from the facts or the brief.
doc-scan: docLabel, docTitle, flags (2 to 3 {text up to 6 words, tone warn|ok|bad}), headline (1 to 2 lines), caption?. 4.5 to 5.5 s.
steps: headline (1 to 3 lines), caption?, steps (exactly 3, up to 4 words each). 3.5 to 4.5 s.
end-card: tagline (up to 6 words, one *accent* word), cta (up to 7 words), fineprint?. 3 to 4.5 s. Always the last scene.`;

export const CUSTOM_GUIDE = `custom: code (a JavaScript module as a string), css? (scoped CSS as a string). 4 to 6 s. Use at most two per video, and only for a moment no template can express: a diagram of how the product works, a visual metaphor, a bespoke chart or device. Never for plain text.

A custom scene module:
  export default function scene(root, api) {
    const { gsap, h, img, markup, headline, kicker, revealLines, fadeUp, popIn, countUp, drift, brand, duration, layout, motion } = api;
    const tl = gsap.timeline();
    root.classList.add('my-scene');            // prefix every CSS selector with this class
    ...build DOM with h() and append to root...
    ...add tweens to tl; use motion.enter / motion.ease / motion.pop / motion.stagger...
    return tl;                                  // required: a timeline starting at 0
  }
Rules for the code: it runs once before the first frame and the timeline is seeked to every frame, so no Math.random, Date, timers, requestAnimationFrame, fetch, event listeners, imports or eval. Take everything from api. Layout classes you may use: .center, .stack, .split (> .copy and > .visual), .card, .caption, .kicker, .display with .h-xl/.h-lg/.h-md/.h-sm; they respect the safe area and reflow for portrait. Use CSS variables for colour and shape: var(--scene-fg), var(--em), var(--soft), var(--surface), var(--surface-fg), var(--rule), var(--primary), var(--primary-dark), var(--accent), var(--highlight), var(--radius-card), var(--radius-pill), var(--shadow-card). Sizes are design pixels: the short side of the frame is 1080. Text must fit inside the frame at 9:16 (1080 wide) as well as 16:9. Images: only brand.logo via api.img(brand.logo). Keep the whole scene under 120 lines.`;

const KIND_GUIDE: Record<Kind, string> = {
  reel: 'A reel: 10 to 20 seconds, usually 9:16. Structure: hook, then 1 to 3 content scenes (tip, myth-fact, stat, list, versus, quote), then end-card. One idea only.',
  ad: 'An ad: 15 to 35 seconds. Structure: open on the pain (statement with a card, or hook), sharpen it (strike or stat), logo-reveal, 2 to 4 product scenes (chat, doc-scan, steps, versus, counter), end-card.',
  explainer: 'An explainer: 30 to 60 seconds. Structure: statement or hook, the problem (strike, stat, myth-fact), logo-reveal, then how it works in order (steps, doc-scan, chat, list, versus), proof (counter or quote, only from real facts), end-card.'
};

export const SYSTEM_PROMPT = `You write scripts for brandreel, a tool that renders branded motion-graphics videos from JSON. You return one JSON object: { title, slug, scenes[] }. Each scene has a template, a duration in seconds, an optional theme, and the fields that template takes. Fields not listed for a template must be omitted.

Templates (fields, limits, usual duration):
${TEMPLATE_GUIDE}

Text markup: wrap a word or short phrase in *asterisks* to set it in the accent font and colour. Use it on at most one phrase per scene, on the word that carries the idea.

Themes: "light", "dark" and "brand" are always available; a brand kit may declare more by name. Alternate light and dark scenes so the video has rhythm; keep logo-reveal and end-card on their defaults unless told otherwise.

Writing rules:
- One idea per scene. Say it in the fewest words that still sound like a person.
- Headline lines are short. A line that needs more than 4 words belongs in body, caption or answer.
- Sentence case. No ALL CAPS, no emoji, no hashtags, no exclamation marks.
- Never use em dashes or en dashes. Use a full stop, a comma or a colon.
- Concrete beats abstract: a number, a place, a moment, a thing the viewer can picture.
- Truth: use only the facts in the brand kit and the brief. Never invent statistics, prices, plan or product names, testimonials, awards or dates. If a template needs a number you do not have, choose another template.
- Follow the brand's voice rules exactly; they override anything above.
- Durations: keep the total within 15% of the target length. Sum them yourself before answering.
- slug: lowercase words joined by dashes, from the title.`;

export const systemPrompt = (allowCustom: boolean): string => allowCustom ? `${SYSTEM_PROMPT}\n\nCustom scenes are allowed in this script:\n${CUSTOM_GUIDE}` : SYSTEM_PROMPT;

export interface WriteInput {
  brief: string;
  kind: Kind;
  format: FormatName;
  seconds: number;
  style?: StylePackName;
  kit: Kit;
  allowCustom?: boolean;
}

const brandOf = (kit: Kit): Record<string, unknown> => ((kit as Record<string, unknown>)['brand'] as Record<string, unknown> | undefined) ?? {};

export function userPrompt(input: WriteInput): string {
  const { kit } = input;
  const brand = brandOf(kit) as { name?: string; handle?: string };
  const themes = Object.keys(((kit as Record<string, unknown>)['themes'] as Record<string, unknown> | undefined) ?? {});
  const voice = kit.voice;
  const lines = [
    `Brand: ${brand.name ?? 'unknown'}${brand.handle ? ` (${brand.handle})` : ''}.`,
    voice?.audience ? `Audience: ${voice.audience}` : '',
    voice?.tone ? `Tone: ${voice.tone}` : '',
    voice?.rules?.length ? `Voice rules:\n${voice.rules.map(rule => `- ${rule}`).join('\n')}` : '',
    voice?.avoid?.length ? `Avoid: ${voice.avoid.join('; ')}.` : '',
    voice?.cta ? `Default call to action: "${voice.cta}"` : '',
    kit.facts.length ? `Facts you may use (cite nothing else):\n${kit.facts.map(fact => `- ${fact}`).join('\n')}` : 'Facts: none supplied, so use no numbers or claims beyond the brief.',
    themes.length ? `Custom themes available: ${themes.join(', ')}.` : '',
    '',
    `Format: ${input.format}. ${KIND_GUIDE[input.kind]}`,
    `Target length: ${input.seconds} seconds.`,
    input.style ? `Style pack: ${input.style}.` : '',
    input.allowCustom ? 'You may include custom scenes (see the system prompt) where they earn their place.' : '',
    '',
    `Brief:\n${input.brief.trim()}`
  ];
  return lines.filter(line => line !== '').join('\n');
}

export const repairPrompt = (problems: string): string =>
  `That script did not validate. Fix every issue below and return the complete script again, keeping everything that was already right.\n\n${problems}`;

// ---- The model call, behind an interface so tests can fake it ----
export interface DraftResult<T> {
  value: T | null;
  stopReason: string | null;
  usage?: { input: number; output: number };
}
export interface Writer {
  model: string;
  draft: <T>(system: string, messages: Anthropic.MessageParam[], schema: z.ZodType<T>) => Promise<DraftResult<T>>;
}

export interface WriteOutcome {
  project: Project;
  video: Record<string, unknown>;   // the JSON to save, with asset paths relative to the kit
  draft: Draft;
  attempts: number;
  usage: { input: number; output: number };
  files: string[];                  // custom scene files written under the kit
}

const stripKit = (kit: Kit): Record<string, unknown> => {
  const { voice: _voice, facts: _facts, ...rest } = kit as Record<string, unknown>;
  return rest;
};

export const slugify = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'video';

// Assembles kit + draft into a video object and validates it exactly like a hand-written file.
// Custom scene code is linted and written to <kit>/drafts/<slug>/scene-N.js first, so the
// loader can serve it like any other asset.
export async function assemble(kit: Kit, kitDir: string, draft: Draft, input: Pick<WriteInput, 'format' | 'style'>, label: string): Promise<{ project: Project; video: Record<string, unknown>; files: string[] }> {
  const scenes = scenesFromDraft(draft);
  const slug = slugify(draft.slug || draft.title);
  const problems: string[] = [];
  const files: string[] = [];
  for (const [index, scene] of draft.scenes.entries()) {
    if (scene.template !== 'custom') continue;
    if (!scene.code) { problems.push(`scenes.${index}.code: a custom scene needs its module source in "code"`); continue; }
    problems.push(...lintSceneCode(scene.code).map(problem => `scenes.${index}.code: ${problem}`));
    if (scene.css) problems.push(...lintSceneCss(scene.css).map(problem => `scenes.${index}.css: ${problem}`));
  }
  if (problems.length) throw new SpecError(`${label} has problems in its custom scenes:\n${problems.map(problem => `  • ${problem}`).join('\n')}`);
  for (const [index, scene] of draft.scenes.entries()) {
    if (scene.template !== 'custom' || !scene.code) continue;
    const dir = path.join(kitDir, 'drafts', slug);
    await mkdir(dir, { recursive: true });
    const base = `scene-${index + 1}`;
    await writeFile(path.join(dir, `${base}.js`), scene.code.endsWith('\n') ? scene.code : `${scene.code}\n`);
    files.push(path.join(dir, `${base}.js`));
    const target = scenes[index] as Record<string, unknown>;
    target['code'] = `drafts/${slug}/${base}.js`;
    if (scene.css) {
      await writeFile(path.join(dir, `${base}.css`), scene.css.endsWith('\n') ? scene.css : `${scene.css}\n`);
      files.push(path.join(dir, `${base}.css`));
      target['css'] = `drafts/${slug}/${base}.css`;
    }
  }
  const video: Record<string, unknown> = { ...stripKit(kit), format: input.format, scenes };
  if (input.style) video['style'] = input.style;
  const project = await loadProjectFrom(structuredClone(video), kitDir, label);
  return { project, video, files };
}

export async function writeVideo(writer: Writer, input: WriteInput, kitDir: string, maxAttempts = 3): Promise<WriteOutcome> {
  const system = systemPrompt(Boolean(input.allowCustom));
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt(input) }];
  const usage = { input: 0, output: 0 };
  let lastProblem = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await writer.draft(system, messages, draftSchema);
    if (result.usage) { usage.input += result.usage.input; usage.output += result.usage.output; }
    if (result.stopReason === 'refusal') throw new SpecError('The model declined to write this brief.');
    if (result.stopReason === 'max_tokens') throw new SpecError('The draft was cut off (max_tokens). Ask for a shorter video.');
    if (!result.value) {
      lastProblem = 'The reply was not a JSON object matching the schema.';
    } else {
      if (!input.allowCustom && result.value.scenes.some(scene => scene.template === 'custom')) {
        lastProblem = 'Custom scenes are not allowed in this script. Use the built-in templates only.';
      } else {
        try {
          const { project, video, files } = await assemble(input.kit, kitDir, result.value, input, `draft ${attempt}`);
          return { project, video, draft: result.value, attempts: attempt, usage, files };
        } catch (error) {
          if (!(error instanceof SpecError)) throw error;
          lastProblem = error.message;
        }
      }
      messages.push({ role: 'assistant', content: JSON.stringify(result.value) });
    }
    messages.push({ role: 'user', content: repairPrompt(lastProblem) });
  }
  throw new SpecError(`No valid script after ${maxAttempts} attempts. Last problem:\n${lastProblem}`);
}

// ---- Review: the model looks at frames of the scenes it wrote and fixes what is wrong ----
export const reviewSchema = z.object({
  verdict: z.enum(['ok', 'fix']),
  notes: z.string(),
  fixes: z.array(z.object({ scene: z.number(), code: z.string().optional(), css: z.string().optional() }))
});
export type Review = z.infer<typeof reviewSchema>;

export const REVIEW_SYSTEM = `You are reviewing frames rendered from custom brandreel scenes you wrote. Judge them as a motion designer would: is every word inside the frame and readable, does nothing overlap, do the elements sit where the code intended, does the scene look finished rather than broken or empty, does it read at 9:16 as well as 16:9 when both are shown. Frames are sampled at 25%, 60% and 95% of the scene, so early frames may still be animating in; judge the 60% and 95% frames for layout.

Reply with verdict "ok" when the scenes pass, or "fix" with a complete replacement "code" (and "css" if needed) for each scene that needs work. Keep the same contract and rules as before. Scene numbers are 1-based positions in the video.`;

export type StillsFn = (project: Project, times: number[], directory: string) => Promise<string[]>;
export type ImageFn = (file: string) => Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' }>;

// A 960px JPEG of a still, base64, so review rounds stay cheap.
export const jpegOf: ImageFn = file => new Promise((resolve, reject) => {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', 'scale=960:-2', '-q:v', '5', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve({ data: Buffer.concat(chunks).toString('base64'), mediaType: 'image/jpeg' }) : reject(new Error(`ffmpeg could not read ${file}`)));
});

export interface ReviewOptions {
  rounds: number;
  stills: StillsFn;
  image?: ImageFn;
  directory: string;                       // where stills go
  input: Pick<WriteInput, 'format' | 'style'>;
  kit: Kit;
  kitDir: string;
}

export interface ReviewOutcome { rounds: number; notes: string[]; outcome: WriteOutcome }

export async function reviewCustomScenes(writer: Writer, outcome: WriteOutcome, options: ReviewOptions): Promise<ReviewOutcome> {
  const image = options.image ?? jpegOf;
  const notes: string[] = [];
  let current = outcome;
  for (let round = 1; round <= options.rounds; round++) {
    const customs = current.draft.scenes.map((scene, index) => ({ scene, index })).filter(({ scene }) => scene.template === 'custom');
    if (!customs.length) return { rounds: round - 1, notes, outcome: current };
    // Sample each custom scene at three points.
    let at = 0;
    const starts = current.draft.scenes.map(scene => { const start = at; at += scene.duration; return start; });
    const times = customs.flatMap(({ index }) => [.25, .6, .95].map(f => Number(((starts[index] ?? 0) + (current.draft.scenes[index]?.duration ?? 1) * f).toFixed(2))));
    let problem: string | null = null;
    let files: string[] = [];
    try { files = await options.stills(current.project, times, options.directory); }
    catch (error) { problem = error instanceof Error ? error.message : String(error); }

    const content: Anthropic.ContentBlockParam[] = [];
    if (problem) {
      content.push({ type: 'text', text: `Rendering the custom scenes failed:\n${problem}\n\nFix the code so the scene renders. Return verdict "fix" with the complete replacement.` });
    } else {
      content.push({ type: 'text', text: `Frames of the custom scene${customs.length > 1 ? 's' : ''} at 25%, 60% and 95% of each scene, in order.` });
      for (const file of files) content.push({ type: 'image', source: { type: 'base64', media_type: (await image(file)).mediaType, data: (await image(file)).data } });
    }
    content.push({ type: 'text', text: customs.map(({ scene, index }) => `Scene ${index + 1} (${scene.duration}s) code:\n${scene.code ?? ''}\n${scene.css ? `Scene ${index + 1} CSS:\n${scene.css}` : ''}`).join('\n\n') });
    const result = await writer.draft(REVIEW_SYSTEM, [{ role: 'user', content }], reviewSchema);
    if (result.usage) { current.usage.input += result.usage.input; current.usage.output += result.usage.output; }
    if (!result.value) { notes.push(`Round ${round}: the review reply did not match the schema.`); continue; }
    notes.push(`Round ${round}: ${result.value.notes}`);
    if (result.value.verdict === 'ok' && !problem) return { rounds: round, notes, outcome: current };
    if (!result.value.fixes.length) { if (problem) continue; return { rounds: round, notes, outcome: current }; }
    const draft: Draft = structuredClone(current.draft);
    for (const fix of result.value.fixes) {
      const scene = draft.scenes[fix.scene - 1];
      if (!scene || scene.template !== 'custom') continue;
      if (fix.code) scene.code = fix.code;
      if (fix.css) scene.css = fix.css;
    }
    try {
      const { project, video, files: written } = await assemble(options.kit, options.kitDir, draft, options.input, `review round ${round}`);
      current = { ...current, project, video, draft, files: written };
    } catch (error) {
      if (!(error instanceof SpecError)) throw error;
      notes.push(`Round ${round}: the fix did not validate (${error.message.split('\n')[0]}); keeping the previous version.`);
    }
  }
  return { rounds: options.rounds, notes, outcome: current };
}

// ---- Look: a style pack of the brand's own, drafted from a description ----
export const lookSchema = z.object({
  extends: z.enum(STYLE_PACK_NAMES),
  css: z.string(),
  themes: z.array(z.object({
    name: z.string(), background: z.string(), background2: z.string().optional(), text: z.string(),
    em: z.string().optional(), soft: z.string().optional(), surface: z.string().optional(), surfaceText: z.string().optional()
  })),
  notes: z.string()
});
export type Look = z.infer<typeof lookSchema>;

export const LOOK_SYSTEM = `You design the look of brandreel videos: a CSS file that extends one of four style packs, plus optional colour themes. You return { extends, css, themes[], notes }.

Style packs to extend: bold (big condensed headlines, deep shadows, snappy), editorial (flat, hairlines, calm), soft (rounded, pastel, bouncy), tech (sharp, grid, glow). Pick the closest one and change only what the description asks for.

Your CSS is loaded after the pack. Override tokens on #stage first; they cascade everywhere:
  --h-xl-base --h-lg-base --h-md-base --h-sm-base (headline sizes, px; defaults 190/150/120/92)
  --display-tracking --display-leading
  --radius-card --radius-chip --radius-pill
  --shadow-card --shadow-chip --card-border
  --grain-opacity (0 to .12) --texture (a CSS background-image for a subtle pattern, or none)
Then theme backgrounds if needed: .theme-light { --scene-bg: ... } .theme-dark { --scene-bg: ... } .theme-brand { --scene-bg: ... } (use the brand variables --paper, --night, --primary, --primary-dark, --accent, --tint, --tint-strong, and color-mix()).
Then, sparingly, selectors from the base stylesheet: .display, .kicker, .kicker::before, .caption, .body, .card, .cta, .stamp, .list-item, .vs-col, .mf-card, .flag, .step .num, .ask, .answer.
Do not use @import, url(), external fonts, or absolute positioning. Do not change font-family (fonts come from the brand). Keep every size in design pixels (the frame's short side is 1080). Keep at least 4.5:1 contrast between text and background in every theme you define; hex colours only. Keep the CSS under 80 lines.

Themes: each has a name (lowercase-dashes), background (hex) with optional background2 (hex, makes a gradient), text (hex), and optional em, soft, surface, surfaceText (hex). Define 0 to 3, only when the description calls for scenes the built-in light/dark/brand themes cannot give.

notes: two or three sentences on what you changed and why, for the person reviewing.`;

export function lookPrompt(kit: Kit, description: string): string {
  const brand = brandOf(kit) as { name?: string; colors?: Record<string, string>; fonts?: Record<string, { family?: string }> };
  const colors = Object.entries(brand.colors ?? {}).map(([key, value]) => `${key} ${value}`).join(', ');
  const fonts = Object.entries(brand.fonts ?? {}).map(([role, font]) => `${role}: ${font?.family ?? '?'}`).join(', ');
  const current = (kit as Record<string, unknown>)['style'];
  return [
    `Brand: ${brand.name ?? 'unknown'}.`,
    `Brand colours: ${colors || 'not set'}.`,
    `Fonts: ${fonts || 'not set'}.`,
    current ? `Current style: ${JSON.stringify(current)}.` : '',
    '',
    `Description of the look wanted:\n${description.trim()}`
  ].filter(line => line !== '').join('\n');
}

// Applies a look to a kit object (not saved): style.extends + look.css, themes merged in.
export function applyLook(kit: Kit, look: Look, cssFile = 'look.css'): Kit {
  const next = structuredClone(kit) as Record<string, unknown>;
  next['style'] = { extends: look.extends, css: cssFile };
  const themes = { ...((next['themes'] as Record<string, unknown> | undefined) ?? {}) };
  for (const theme of look.themes) {
    const name = slugify(theme.name);
    const entry: Record<string, unknown> = { background: theme.background2 ? [theme.background, theme.background2] : theme.background, text: theme.text };
    for (const key of ['em', 'soft', 'surface', 'surfaceText'] as const) if (theme[key]) entry[key] = theme[key];
    themes[name] = entry;
  }
  if (Object.keys(themes).length) next['themes'] = themes;
  return next as Kit;
}

// A fixed script that shows the look on the templates that matter most.
export function lookSample(kit: Kit): Draft {
  const themeNames = Object.keys(((kit as Record<string, unknown>)['themes'] as Record<string, unknown> | undefined) ?? {});
  const brand = brandOf(kit) as { name?: string };
  const name = brand.name ?? 'Your brand';
  return {
    title: 'Look sample', slug: 'look-sample',
    scenes: [
      { template: 'hook', duration: 3, kicker: 'Look sample', text: `How ${name} *looks* in motion.` },
      { template: 'tip', duration: 4, kicker: 'Tip 1 of 3', headline: ['Headline in', '*two lines.*'], body: 'Body copy at reading size, with a note below it for the small print.', note: 'A note under a rule.' },
      { template: 'stat', duration: 3.5, theme: themeNames[0], kicker: 'A number', value: '57%', label: 'of frames are judged by their type and colour.', source: 'Sample, not a real figure' },
      { template: 'list', duration: 4, title: ['Three', '*things.*'], items: ['Cards and chips', 'Buttons and pills', 'Rules and kickers'] },
      { template: 'chat', duration: 5, assistant: name, headline: ['Cards in', '*action.*'], question: 'Does the look hold up on a busy scene?', answer: 'Check the card, the bubbles and the result rows.', results: [{ name: 'Result one', tags: ['Tag'], score: 92 }, { name: 'Result two', tags: ['Tag'], score: 87 }] },
      { template: 'end-card', duration: 3.5, tagline: 'The end *card.*', cta: 'Call to action', fineprint: 'Fine print in the soft colour' }
    ]
  };
}

export async function writeLook(writer: Writer, kit: Kit, description: string): Promise<{ look: Look; usage: { input: number; output: number } }> {
  const result = await writer.draft(LOOK_SYSTEM, [{ role: 'user', content: lookPrompt(kit, description) }], lookSchema);
  if (result.stopReason === 'refusal') throw new SpecError('The model declined to design this look.');
  if (!result.value) throw new SpecError('The look reply did not match the schema.');
  const problems = lintSceneCss(result.value.css);
  if (/font-family/.test(result.value.css)) problems.push('CSS must not change font-family');
  if (problems.length) throw new SpecError(`The look CSS breaks the rules: ${problems.join('; ')}`);
  return { look: result.value, usage: result.usage ?? { input: 0, output: 0 } };
}

// When the saved file lives somewhere other than the kit, its relative asset paths must be
// rewritten so they still point at the kit's files.
export function relocateAssets(video: Record<string, unknown>, fromDir: string, toDir: string): Record<string, unknown> {
  if (path.resolve(fromDir) === path.resolve(toDir)) return video;
  const move = (src: unknown): unknown => typeof src === 'string' && !/^https?:\/\//.test(src) ? path.relative(toDir, path.resolve(fromDir, src)).split(path.sep).join('/') : src;
  const out = structuredClone(video);
  const brand = out['brand'] as Record<string, unknown> | undefined;
  if (brand) {
    if (brand['logo']) brand['logo'] = move(brand['logo']);
    const fonts = brand['fonts'] as Record<string, { files?: { src: unknown }[] } | undefined> | undefined;
    for (const font of Object.values(fonts ?? {})) for (const file of font?.files ?? []) file.src = move(file.src);
  }
  const style = out['style'];
  if (style && typeof style === 'object' && (style as Record<string, unknown>)['css']) (style as Record<string, unknown>)['css'] = move((style as Record<string, unknown>)['css']);
  const audio = out['audio'] as Record<string, unknown> | undefined;
  if (audio?.['src']) audio['src'] = move(audio['src']);
  for (const scene of (out['scenes'] as Record<string, unknown>[] | undefined) ?? []) {
    for (const key of ['image', 'code', 'css']) if (scene[key]) scene[key] = move(scene[key]);
  }
  return out;
}

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_THEME, type TemplateId } from './constants.js';
import { loadProjectFrom, SpecError, type Project } from './load.js';
import type { FormatName, StylePackName } from './spec.js';

// `brandreel write`: a brief plus a brand kit becomes a validated video.json. Claude drafts
// the scenes as structured output; the draft is coerced into scene objects and run through
// the same loader as a hand-written script, and validation errors go back to the model for
// one or two repair rounds. Nothing here touches the renderer.

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
  left: side.optional(), right: side.optional()
});
export const draftSchema = z.object({
  title: z.string(),
  slug: z.string(),
  scenes: z.array(draftScene)
});
export type Draft = z.infer<typeof draftSchema>;

// Turns the flat draft into real scene objects: drops empty fields and fixes the two fields
// whose type depends on the template (`value`, `title`).
export function scenesFromDraft(draft: Draft): Record<string, unknown>[] {
  return draft.scenes.map(scene => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scene)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      out[key] = value;
    }
    if (scene.template === 'counter' && scene.value !== undefined) out['value'] = Math.round(Number(String(scene.value).replace(/[^\d.-]/g, '')) || 0);
    if (scene.template === 'stat' && scene.value !== undefined) out['value'] = String(scene.value);
    if (scene.template === 'list' && typeof scene.title === 'string') out['title'] = [scene.title];
    if (scene.template === 'versus' && Array.isArray(scene.title)) out['title'] = scene.title.join(' ');
    return out;
  });
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

export interface WriteInput {
  brief: string;
  kind: Kind;
  format: FormatName;
  seconds: number;
  style?: StylePackName;
  kit: Kit;
}

export function userPrompt(input: WriteInput): string {
  const { kit } = input;
  const brand = (kit as Record<string, unknown>)['brand'] as { name?: string; handle?: string } | undefined;
  const themes = Object.keys(((kit as Record<string, unknown>)['themes'] as Record<string, unknown> | undefined) ?? {});
  const voice = kit.voice;
  const lines = [
    `Brand: ${brand?.name ?? 'unknown'}${brand?.handle ? ` (${brand.handle})` : ''}.`,
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
    '',
    `Brief:\n${input.brief.trim()}`
  ];
  return lines.filter(line => line !== '').join('\n');
}

export const repairPrompt = (problems: string): string =>
  `That script did not validate. Fix every issue below and return the complete script again, keeping everything that was already right.\n\n${problems}`;

// ---- The model call, behind an interface so tests can fake it ----
export interface DraftResult {
  draft: Draft | null;
  stopReason: string | null;
  usage?: { input: number; output: number };
}
export interface Writer {
  model: string;
  draft: (system: string, messages: Anthropic.MessageParam[]) => Promise<DraftResult>;
}

export function anthropicWriter(model = DEFAULT_MODEL): Writer {
  const client = new Anthropic();
  return {
    model,
    async draft(system, messages) {
      const response = await client.messages.parse({
        model,
        max_tokens: 16000,
        system,
        messages,
        output_config: { format: zodOutputFormat(draftSchema) }
      });
      return {
        draft: response.parsed_output ?? null,
        stopReason: response.stop_reason,
        usage: { input: response.usage.input_tokens, output: response.usage.output_tokens }
      };
    }
  };
}

export interface WriteOutcome {
  project: Project;
  video: Record<string, unknown>;   // the JSON to save, with asset paths relative to the kit
  draft: Draft;
  attempts: number;
  usage: { input: number; output: number };
}

const stripKit = (kit: Kit): Record<string, unknown> => {
  const { voice: _voice, facts: _facts, ...rest } = kit as Record<string, unknown>;
  return rest;
};

// Assembles kit + draft into a video object and validates it exactly like a hand-written file.
export async function assemble(kit: Kit, kitDir: string, draft: Draft, input: Pick<WriteInput, 'format' | 'style'>, label: string): Promise<{ project: Project; video: Record<string, unknown> }> {
  const video: Record<string, unknown> = { ...stripKit(kit), format: input.format, scenes: scenesFromDraft(draft) };
  if (input.style) video['style'] = input.style;
  const project = await loadProjectFrom(structuredClone(video), kitDir, label);
  return { project, video };
}

export async function writeVideo(writer: Writer, input: WriteInput, kitDir: string, maxAttempts = 3): Promise<WriteOutcome> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt(input) }];
  const usage = { input: 0, output: 0 };
  let lastProblem = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await writer.draft(SYSTEM_PROMPT, messages);
    if (result.usage) { usage.input += result.usage.input; usage.output += result.usage.output; }
    if (result.stopReason === 'refusal') throw new SpecError('The model declined to write this brief.');
    if (result.stopReason === 'max_tokens') throw new SpecError('The draft was cut off (max_tokens). Ask for a shorter video.');
    if (!result.draft) {
      lastProblem = 'The reply was not a JSON object matching the schema.';
    } else {
      try {
        const { project, video } = await assemble(input.kit, kitDir, result.draft, input, `draft ${attempt}`);
        return { project, video, draft: result.draft, attempts: attempt, usage };
      } catch (error) {
        if (!(error instanceof SpecError)) throw error;
        lastProblem = error.message;
      }
      messages.push({ role: 'assistant', content: JSON.stringify(result.draft) });
    }
    messages.push({ role: 'user', content: repairPrompt(lastProblem) });
  }
  throw new SpecError(`No valid script after ${maxAttempts} attempts. Last problem:\n${lastProblem}`);
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
  for (const scene of (out['scenes'] as Record<string, unknown>[] | undefined) ?? []) if (scene['image']) scene['image'] = move(scene['image']);
  return out;
}

export const slugify = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'video';

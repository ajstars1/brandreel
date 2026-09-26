import { z } from 'zod';
import { FORMATS, type FormatName } from './constants.js';

// A video is a brand kit plus an ordered list of scenes. Each scene names a template and
// gives that template's props. Text fields accept markup: wrap words in *asterisks* to set
// them in the accent font and colour.

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #79218c');

const fontFile = z.object({
  src: z.string().min(1),
  weight: z.number().int().min(100).max(900).default(400),
  style: z.enum(['normal', 'italic']).default('normal')
});
const font = z.object({
  family: z.string().min(1),
  files: z.array(fontFile).default([]),
  uppercase: z.boolean().default(false)
});

export const brandSchema = z.object({
  name: z.string().min(1),
  logo: z.string().min(1).optional(),
  // 'spin' suits round or pinwheel marks; 'pop' scales the logo in without turning it.
  logoMotion: z.enum(['spin', 'pop']).default('pop'),
  colors: z.object({
    primary: color,
    primaryDark: color,
    accent: color,
    highlight: color.default('#ffe3a8'),
    ink: color.default('#1b141d'),
    paper: color.default('#fbfbf8'),
    night: color.default('#12041a'),
    positive: color.default('#2f9e6b'),
    warning: color.default('#e8a317'),
    negative: color.default('#e5484d')
  }),
  fonts: z.object({
    display: font,
    body: font,
    accent: font.optional()
  })
});

const theme = z.enum(['light', 'dark', 'brand']);
const base = { duration: z.number().positive().max(60), theme: theme.optional() };
const lines = z.array(z.string().min(1)).min(1).max(4);

const statement = z.object({
  template: z.literal('statement'), ...base,
  lines,
  card: z.object({ label: z.string(), value: z.string(), stamp: z.string().optional() }).optional()
});
const strike = z.object({
  template: z.literal('strike'), ...base,
  before: z.string().min(1),
  after: z.string().min(1)
});
const logoReveal = z.object({
  template: z.literal('logo-reveal'), ...base,
  tagline: z.string().optional()
});
const chat = z.object({
  template: z.literal('chat'), ...base,
  headline: lines,
  caption: z.string().optional(),
  assistant: z.string().default('Assistant'),
  question: z.string().min(1),
  answer: z.string().min(1),
  results: z.array(z.object({ name: z.string(), tags: z.array(z.string()).max(3).default([]), score: z.number().min(0).max(100).optional() })).max(4).default([])
});
const counter = z.object({
  template: z.literal('counter'), ...base,
  value: z.number().int().nonnegative(),
  prefix: z.string().default(''),
  suffix: z.string().default(''),
  title: z.string().min(1),
  subtitle: z.string().optional()
});
const docScan = z.object({
  template: z.literal('doc-scan'), ...base,
  docLabel: z.string().default('document.pdf'),
  docTitle: z.string().min(1),
  flags: z.array(z.object({ text: z.string().min(1), tone: z.enum(['warn', 'ok', 'bad']).default('warn') })).min(1).max(4),
  headline: lines,
  caption: z.string().optional()
});
const steps = z.object({
  template: z.literal('steps'), ...base,
  headline: lines,
  caption: z.string().optional(),
  steps: z.array(z.string().min(1)).min(2).max(5)
});
const endCard = z.object({
  template: z.literal('end-card'), ...base,
  tagline: z.string().min(1),
  cta: z.string().min(1),
  fineprint: z.string().optional()
});

export const sceneSchema = z.discriminatedUnion('template', [statement, strike, logoReveal, chat, counter, docScan, steps, endCard]);

export { FORMATS, DEFAULT_THEME, dimensions, type FormatName } from './constants.js';

export const videoSchema = z.object({
  format: z.enum(Object.keys(FORMATS) as [FormatName, ...FormatName[]]).default('16:9'),
  fps: z.number().int().min(12).max(60).default(30),
  transition: z.enum(['wipe', 'fade', 'cut']).default('wipe'),
  audio: z.object({ src: z.string().min(1), volume: z.number().min(0).max(2).default(1), fadeOut: z.number().min(0).max(10).default(1.5) }).optional(),
  brand: brandSchema,
  scenes: z.array(sceneSchema).min(1)
});

export type Brand = z.infer<typeof brandSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Video = z.infer<typeof videoSchema>;
export type Theme = z.infer<typeof theme>;
export type TemplateName = Scene['template'];
export type SceneOf<T extends TemplateName> = Extract<Scene, { template: T }>;

export const totalDuration = (video: Pick<Video, 'scenes'>): number =>
  video.scenes.reduce((sum, scene) => sum + scene.duration, 0);

export const parseVideo = (input: unknown): Video => videoSchema.parse(input);

// The browser runtime keeps its own list of template ids (it cannot import zod). Fail the
// build if the two ever drift apart.
type SameTemplates = [TemplateName] extends [import('./constants.js').TemplateId] ? ([import('./constants.js').TemplateId] extends [TemplateName] ? true : false) : false;
export const templatesInSync: SameTemplates = true;

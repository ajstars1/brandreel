import { z } from 'zod';
import { BUILTIN_THEMES, FORMATS, STYLE_PACK_NAMES, type FormatName } from './constants.js';

export { FORMATS, DEFAULT_THEME, STYLE_PACKS, STYLE_PACK_NAMES, BUILTIN_THEMES, dimensions, type FormatName, type StylePackName } from './constants.js';

// A video is a brand kit plus an ordered list of scenes. Each scene names a template and
// gives that template's props. Text fields accept markup: wrap words in *asterisks* to set
// them in the accent font and colour.

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #79218c');
const text = z.string().min(1);
const lines = z.array(text).min(1).max(4);
const slug = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes');

const fontFile = z.object({
  src: text,
  weight: z.number().int().min(100).max(900).default(400),
  style: z.enum(['normal', 'italic']).default('normal')
});
const font = z.object({
  family: text,
  files: z.array(fontFile).default([]),
  uppercase: z.boolean().default(false)
});

export const brandSchema = z.object({
  name: text,
  handle: z.string().min(1).max(40).optional(),          // e.g. "@policygaido", shown as a small watermark
  logo: text.optional(),
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

// A custom theme: the colours of one scene. `background` is a flat colour or a two-stop gradient.
export const themeSchema = z.object({
  background: z.union([color, z.tuple([color, color])]),
  text: color,
  em: color.optional(),          // accent words and numbers; defaults to a brand colour that reads on the background
  soft: color.optional(),        // captions and secondary text
  surface: color.optional(),     // cards; defaults to white
  surfaceText: color.optional()  // text on cards; defaults to the brand ink
});

const motionSchema = z.object({
  enter: z.number().min(.1).max(3), stagger: z.number().min(0).max(1), ease: text, pop: text, drift: z.number().min(0).max(.2)
});

// "bold" or { extends: "editorial", css: "look.css", motion: { ... } }
export const styleSchema = z.union([
  z.enum(STYLE_PACK_NAMES),
  z.object({ extends: z.enum(STYLE_PACK_NAMES).default('bold'), css: text.optional(), motion: motionSchema.partial().optional() })
]).transform(style => typeof style === 'string' ? { extends: style, css: undefined, motion: undefined } : style);

const base = { duration: z.number().positive().max(60), theme: z.string().optional() };

// ---- Long-form templates ----
const statement = z.object({
  template: z.literal('statement'), ...base,
  lines,
  card: z.object({ label: z.string(), value: z.string(), stamp: z.string().optional() }).optional()
});
const strike = z.object({ template: z.literal('strike'), ...base, before: text, after: text });
const logoReveal = z.object({ template: z.literal('logo-reveal'), ...base, tagline: z.string().optional() });
const chat = z.object({
  template: z.literal('chat'), ...base,
  headline: lines,
  caption: z.string().optional(),
  assistant: z.string().default('Assistant'),
  question: text,
  answer: text,
  results: z.array(z.object({ name: z.string(), tags: z.array(z.string()).max(3).default([]), score: z.number().min(0).max(100).optional() })).max(4).default([])
});
const counter = z.object({
  template: z.literal('counter'), ...base,
  value: z.number().int().nonnegative(),
  prefix: z.string().default(''),
  suffix: z.string().default(''),
  title: text,
  subtitle: z.string().optional()
});
const docScan = z.object({
  template: z.literal('doc-scan'), ...base,
  docLabel: z.string().default('document.pdf'),
  docTitle: text,
  flags: z.array(z.object({ text, tone: z.enum(['warn', 'ok', 'bad']).default('warn') })).min(1).max(4),
  headline: lines,
  caption: z.string().optional()
});
const steps = z.object({
  template: z.literal('steps'), ...base,
  headline: lines,
  caption: z.string().optional(),
  steps: z.array(text).min(2).max(5)
});
const endCard = z.object({
  template: z.literal('end-card'), ...base,
  tagline: text,
  cta: text,
  fineprint: z.string().optional()
});

// ---- Short-form templates (daily reels) ----
const hook = z.object({ template: z.literal('hook'), ...base, text, kicker: z.string().optional() });
const tip = z.object({
  template: z.literal('tip'), ...base,
  kicker: z.string().optional(),
  headline: lines,
  body: z.string().optional(),
  note: z.string().optional()
});
const mythFact = z.object({
  template: z.literal('myth-fact'), ...base,
  kicker: z.string().optional(),
  myth: text, fact: text,
  mythLabel: z.string().default('Myth'), factLabel: z.string().default('Fact')
});
const stat = z.object({
  template: z.literal('stat'), ...base,
  kicker: z.string().optional(),
  value: z.string().min(1).max(16),   // "57%", "₹3,40,000", "3x": the digits count up, the rest stays
  label: text,
  source: z.string().optional()
});
const quote = z.object({
  template: z.literal('quote'), ...base,
  text, author: text,
  role: z.string().optional(),
  image: z.string().optional()
});
const list = z.object({
  template: z.literal('list'), ...base,
  title: lines,
  items: z.array(text).min(2).max(6),
  numbered: z.boolean().default(true)
});
const side = z.object({ label: text, items: z.array(text).min(1).max(5) });
const versus = z.object({ template: z.literal('versus'), ...base, title: z.string().optional(), left: side, right: side });
const media = z.object({
  template: z.literal('media'), ...base,
  image: text,
  headline: lines,
  caption: z.string().optional()
});

// A scene written in code: a JS module (see docs/custom-scenes.md) with optional CSS and props.
const custom = z.object({
  template: z.literal('custom'), ...base,
  code: text,
  css: z.string().optional(),
  props: z.record(z.string(), z.unknown()).default({}),
  // Named local images the scene shows, read as api.images.<name>. The loader serves them.
  images: z.record(z.string(), text).default({})
});

export const sceneSchema = z.discriminatedUnion('template', [
  statement, strike, logoReveal, chat, counter, docScan, steps, endCard,
  hook, tip, mythFact, stat, quote, list, versus, media, custom
]);

export const videoSchema = z.object({
  format: z.enum(Object.keys(FORMATS) as [FormatName, ...FormatName[]]).default('16:9'),
  fps: z.number().int().min(12).max(60).default(30),
  style: styleSchema.default({ extends: 'bold', css: undefined, motion: undefined }),
  transition: z.enum(['wipe', 'fade', 'cut']).optional(),   // defaults to the style pack's transition
  themes: z.record(slug, themeSchema).default({}),
  watermark: z.boolean().optional(),                        // defaults to true when the brand has a handle
  progressBar: z.boolean().default(false),
  safeArea: z.boolean().default(true),                      // keep text clear of app controls on 9:16
  audio: z.object({ src: text, volume: z.number().min(0).max(2).default(1), fadeIn: z.number().min(0).max(10).default(.4), fadeOut: z.number().min(0).max(10).default(1.5) }).optional(),
  brand: brandSchema,
  scenes: z.array(sceneSchema).min(1)
}).superRefine((video, context) => {
  video.scenes.forEach((scene, index) => {
    if (scene.theme && !(BUILTIN_THEMES as readonly string[]).includes(scene.theme) && !(scene.theme in video.themes)) {
      const declared = Object.keys(video.themes).join(', ') || '(none declared)';
      context.addIssue({ code: 'custom', path: ['scenes', index, 'theme'], message: `Unknown theme "${scene.theme}". Use ${BUILTIN_THEMES.join(', ')} or one of: ${declared}` });
    }
  });
});

export type Brand = z.infer<typeof brandSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type Style = z.infer<typeof styleSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Video = z.infer<typeof videoSchema>;
export type TemplateName = Scene['template'];
export type SceneOf<T extends TemplateName> = Extract<Scene, { template: T }>;

export const totalDuration = (video: Pick<Video, 'scenes'>): number =>
  video.scenes.reduce((sum, scene) => sum + scene.duration, 0);

export const parseVideo = (input: unknown): Video => videoSchema.parse(input);

// The browser runtime keeps its own list of template ids (it cannot import zod). Fail the
// build if the two ever drift apart.
type SameTemplates = [TemplateName] extends [import('./constants.js').TemplateId] ? ([import('./constants.js').TemplateId] extends [TemplateName] ? true : false) : false;
export const templatesInSync: SameTemplates = true;

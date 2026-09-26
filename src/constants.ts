// Values shared by the Node CLI and the browser runtime. No dependencies, so the render page
// can import it directly.

export const FORMATS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] } as const;
export type FormatName = keyof typeof FORMATS;

export type TemplateId =
  | 'statement' | 'strike' | 'logo-reveal' | 'chat' | 'counter' | 'doc-scan' | 'steps' | 'end-card'
  | 'hook' | 'tip' | 'myth-fact' | 'stat' | 'quote' | 'list' | 'versus' | 'media'
  | 'custom';

// Built-in themes are derived from the brand colours. Custom themes are declared in video.json.
export const BUILTIN_THEMES = ['light', 'dark', 'brand'] as const;
export type BuiltinTheme = typeof BUILTIN_THEMES[number];

// Default theme per template, so a spec can leave `theme` out.
export const DEFAULT_THEME: Record<TemplateId, BuiltinTheme> = {
  'statement': 'dark', 'strike': 'light', 'logo-reveal': 'brand', 'chat': 'light',
  'counter': 'dark', 'doc-scan': 'light', 'steps': 'brand', 'end-card': 'light',
  'hook': 'dark', 'tip': 'light', 'myth-fact': 'light', 'stat': 'brand',
  'quote': 'light', 'list': 'light', 'versus': 'light', 'media': 'dark',
  'custom': 'light'
};

// How things move. Every template reads these instead of hardcoding its own numbers, so a
// style pack changes the feel of the whole video at once.
export interface Motion {
  enter: number;    // seconds for a headline line to slide in
  stagger: number;  // seconds between lines or list items
  ease: string;     // entrance ease
  pop: string;      // ease for things that scale in
  drift: number;    // slow push-in amount on held frames (0.03 = 3%)
}

export type TransitionName = 'wipe' | 'fade' | 'cut';

// A style pack is a CSS file in static/styles/<name>.css plus a motion preset and a default
// transition. Brands can extend one with their own CSS.
export const STYLE_PACKS = {
  bold: { transition: 'wipe', motion: { enter: .7, stagger: .18, ease: 'power4.out', pop: 'back.out(1.7)', drift: .03 } },
  editorial: { transition: 'fade', motion: { enter: 1.0, stagger: .24, ease: 'power2.out', pop: 'power2.out', drift: .015 } },
  soft: { transition: 'wipe', motion: { enter: .8, stagger: .14, ease: 'back.out(1.2)', pop: 'elastic.out(1, .6)', drift: .04 } },
  tech: { transition: 'cut', motion: { enter: .45, stagger: .08, ease: 'expo.out', pop: 'expo.out', drift: .02 } }
} as const satisfies Record<string, { transition: TransitionName; motion: Motion }>;
export type StylePackName = keyof typeof STYLE_PACKS;
export const STYLE_PACK_NAMES = Object.keys(STYLE_PACKS) as [StylePackName, ...StylePackName[]];

// Portrait reels keep text out of the bands that Instagram, YouTube and TikTok draw their
// own controls over (design pixels: the short side is always 1080).
export const SAFE_AREA = { top: 220, bottom: 340 } as const;

export const dimensions = (format: FormatName): { width: number; height: number } => {
  const [width, height] = FORMATS[format];
  return { width, height };
};

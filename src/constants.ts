// Values shared by the Node CLI and the browser runtime. No dependencies, so the render page
// can import it directly.

export const FORMATS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] } as const;
export type FormatName = keyof typeof FORMATS;

export type ThemeName = 'light' | 'dark' | 'brand';
export type TemplateId = 'statement' | 'strike' | 'logo-reveal' | 'chat' | 'counter' | 'doc-scan' | 'steps' | 'end-card';

// Default theme per template, so a spec can leave `theme` out.
export const DEFAULT_THEME: Record<TemplateId, ThemeName> = {
  'statement': 'dark', 'strike': 'light', 'logo-reveal': 'brand', 'chat': 'light',
  'counter': 'dark', 'doc-scan': 'light', 'steps': 'brand', 'end-card': 'light'
};

export const dimensions = (format: FormatName): { width: number; height: number } => {
  const [width, height] = FORMATS[format];
  return { width, height };
};

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { parseVideo, type FormatName, type StylePackName, type Video } from './spec.js';

// A loaded project: the validated video (with local asset paths rewritten to URLs the render
// page can fetch) and the files those URLs point to.
export interface Project {
  video: Video;
  assets: Map<string, string>;
  audio?: { file: string; volume: number; fadeOut: number };
  label: string;
}

export interface LoadOverrides { format?: FormatName; style?: StylePackName }

export class SpecError extends Error {}

const isRemote = (src: string): boolean => /^https?:\/\//.test(src);

export const formatZodError = (error: ZodError): string =>
  error.issues.map(issue => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');

export async function loadProject(specPath: string, overrides: LoadOverrides = {}): Promise<Project> {
  const absolute = path.resolve(specPath);
  let raw: unknown;
  try { raw = JSON.parse(await readFile(absolute, 'utf8')); }
  catch (error) { throw new SpecError(`Cannot read ${specPath}: ${error instanceof Error ? error.message : String(error)}`); }
  return loadProjectFrom(raw, path.dirname(absolute), specPath, overrides);
}

// Validates an already parsed spec. `baseDir` is where its relative asset paths resolve;
// `label` names it in error messages (a file name, or "row 12" in a batch).
export async function loadProjectFrom(raw: unknown, baseDir: string, label: string, overrides: LoadOverrides = {}): Promise<Project> {
  if (raw && typeof raw === 'object') {
    const object: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    if (overrides.format) object['format'] = overrides.format;
    if (overrides.style) {
      const current = object['style'];
      object['style'] = current && typeof current === 'object' ? { ...(current as Record<string, unknown>), extends: overrides.style } : overrides.style;
    }
    raw = object;
  }

  let video: Video;
  try { video = parseVideo(raw); }
  catch (error) {
    if (error instanceof ZodError) throw new SpecError(`${label} is not a valid video:\n${formatZodError(error)}`);
    throw error;
  }

  const assets = new Map<string, string>();
  const register = async (src: string, kind: string): Promise<string> => {
    if (isRemote(src)) return src;
    const file = path.resolve(baseDir, src);
    try { if (!(await stat(file)).isFile()) throw new Error('not a file'); }
    catch { throw new SpecError(`${kind} not found: ${src} (looked in ${baseDir})`); }
    const url = `/assets/${assets.size}${path.extname(file).toLowerCase()}`;
    assets.set(url, file);
    return url;
  };

  const { brand } = video;
  if (brand.logo) brand.logo = await register(brand.logo, 'Logo');
  for (const font of [brand.fonts.display, brand.fonts.body, brand.fonts.accent]) {
    if (font) for (const file of font.files) file.src = await register(file.src, 'Font');
  }
  if (video.style.css) video.style.css = await register(video.style.css, 'Style CSS');
  for (const scene of video.scenes) {
    if ('image' in scene && scene.image) scene.image = await register(scene.image, 'Image');
  }
  let audio: Project['audio'];
  if (video.audio) {
    if (isRemote(video.audio.src)) throw new SpecError('audio.src must be a local file');
    const file = path.resolve(baseDir, video.audio.src);
    try { await stat(file); } catch { throw new SpecError(`Audio not found: ${video.audio.src}`); }
    audio = { file, volume: video.audio.volume, fadeOut: video.audio.fadeOut };
  }
  return { video, assets, audio, label };
}

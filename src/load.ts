import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { parseVideo, type FormatName, type Video } from './spec.js';

// A loaded project: the validated video (with local asset paths rewritten to URLs the render
// page can fetch) and the files those URLs point to.
export interface Project {
  video: Video;
  assets: Map<string, string>;
  audio?: { file: string; volume: number; fadeOut: number };
  specPath: string;
}

export class SpecError extends Error {}

const isRemote = (src: string): boolean => /^https?:\/\//.test(src);

export const formatZodError = (error: ZodError): string =>
  error.issues.map(issue => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');

export async function loadProject(specPath: string, overrides: { format?: FormatName } = {}): Promise<Project> {
  const absolute = path.resolve(specPath);
  let raw: unknown;
  try { raw = JSON.parse(await readFile(absolute, 'utf8')); }
  catch (error) { throw new SpecError(`Cannot read ${specPath}: ${error instanceof Error ? error.message : String(error)}`); }
  if (overrides.format && raw && typeof raw === 'object') raw = { ...raw, format: overrides.format };

  let video: Video;
  try { video = parseVideo(raw); }
  catch (error) {
    if (error instanceof ZodError) throw new SpecError(`${specPath} is not a valid video:\n${formatZodError(error)}`);
    throw error;
  }

  const base = path.dirname(absolute);
  const assets = new Map<string, string>();
  const register = async (src: string): Promise<string> => {
    if (isRemote(src)) return src;
    const file = path.resolve(base, src);
    try { if (!(await stat(file)).isFile()) throw new Error('not a file'); }
    catch { throw new SpecError(`Asset not found: ${src} (looked in ${base})`); }
    const url = `/assets/${assets.size}${path.extname(file).toLowerCase()}`;
    assets.set(url, file);
    return url;
  };

  const { brand } = video;
  if (brand.logo) brand.logo = await register(brand.logo);
  for (const font of [brand.fonts.display, brand.fonts.body, brand.fonts.accent]) {
    if (font) for (const file of font.files) file.src = await register(file.src);
  }
  let audio: Project['audio'];
  if (video.audio) {
    if (isRemote(video.audio.src)) throw new SpecError('audio.src must be a local file');
    const file = path.resolve(base, video.audio.src);
    try { await stat(file); } catch { throw new SpecError(`Audio not found: ${video.audio.src}`); }
    audio = { file, volume: video.audio.volume, fadeOut: video.audio.fadeOut };
  }
  return { video, assets, audio, specPath: absolute };
}

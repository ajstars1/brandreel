import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { launchBrowser } from './browser.js';
import type { Project } from './load.js';
import { startServer } from './server.js';
import type {} from './page-api.js';

// Frame-exact rendering: every worker opens the page, seeks the master timeline to each of
// its frames, screenshots it, and pipes the PNGs into its own FFmpeg segment. Segments are
// joined without re-encoding, then the soundtrack is mixed in.

export interface RenderOptions {
  output: string;
  workers?: number;
  onProgress?: (done: number, total: number) => void;
}

interface PageInfo { duration: number; width: number; height: number }

function ffmpeg(args: string[], input?: 'pipe'): { done: Promise<void>; stdin: NodeJS.WritableStream | null } {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [input ?? 'ignore', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr?.on('data', (chunk: Buffer) => { errors += chunk.toString(); });
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', error => reject(new Error(`FFmpeg could not start (${error.message}). Install FFmpeg and make sure it is on PATH.`)));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${errors.trim()}`)));
  });
  return { done, stdin: child.stdin };
}

async function openPage(browser: Browser, url: string, size?: { width: number; height: number }, extraQuery = ''): Promise<{ page: Page; info: PageInfo }> {
  const context = await browser.newContext({ viewport: size ?? { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${url}?render${extraQuery}`);
  await page.waitForFunction(() => window.brandreel !== undefined, undefined, { timeout: 30_000 });
  const info = await page.evaluate(() => {
    const reel = window.brandreel;
    return reel ? { duration: reel.duration, width: reel.width, height: reel.height, error: reel.error } : null;
  });
  if (!info || info.error) throw new Error(`The render page failed: ${info?.error ?? 'no runtime'}`);
  return { page, info };
}

const seek = (page: Page, time: number): Promise<void> => page.evaluate(t => { window.brandreel?.seek(t); }, time);

// Page.captureScreenshot with optimizeForSpeed skips Chrome's slow PNG compression, which is
// most of the per-frame cost. The frame is re-encoded by FFmpeg anyway.
async function frameGrabber(page: Page): Promise<() => Promise<Buffer>> {
  const session = await page.context().newCDPSession(page);
  return async () => {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
    return Buffer.from(data, 'base64');
  };
}

export async function renderVideo(project: Project, options: RenderOptions): Promise<void> {
  const fps = project.video.fps;
  const server = await startServer(project);
  const browser = await launchBrowser();
  const work = await mkdtemp(path.join(tmpdir(), 'brandreel-'));
  const extra: Browser[] = [];
  try {
    const first = await openPage(browser, server.url);
    const { width, height, duration } = first.info;
    await first.page.context().close();
    const total = Math.round(duration * fps);
    const workers = Math.max(1, Math.min(options.workers ?? Math.max(1, Math.floor(availableParallelism() / 2)), 8, Math.ceil(total / fps)));
    const per = Math.ceil(total / workers);
    let done = 0;

    const segments = await Promise.all(Array.from({ length: workers }, async (_, index) => {
      const from = index * per, to = Math.min(total, from + per);
      const segment = path.join(work, `segment-${index}.mp4`);
      if (from >= to) return null;
      // Separate browser processes render in parallel; pages in one browser share a compositor.
      const own = index === 0 ? browser : await launchBrowser();
      if (own !== browser) extra.push(own);
      const { page } = await openPage(own, server.url, { width, height });
      const grab = await frameGrabber(page);
      const encoder = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), segment], 'pipe');
      const stdin = encoder.stdin;
      if (!stdin) throw new Error('FFmpeg input unavailable');
      for (let frame = from; frame < to; frame++) {
        await seek(page, frame / fps);
        const png = await grab();
        if (!stdin.write(png)) await new Promise(resolve => stdin.once('drain', resolve));
        done++; options.onProgress?.(done, total);
      }
      stdin.end();
      await encoder.done;
      await page.context().close();
      return segment;
    }));

    const list = path.join(work, 'segments.txt');
    await writeFile(list, segments.filter((file): file is string => file !== null).map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'));
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    const audio = project.audio;
    const args = ['-f', 'concat', '-safe', '0', '-i', list];
    if (audio) {
      const fadeStart = Math.max(0, duration - audio.fadeOut);
      args.push('-i', audio.file, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-af', `volume=${audio.volume},afade=t=in:st=0:d=${Math.max(.01, audio.fadeIn)},afade=t=out:st=${fadeStart}:d=${Math.max(.01, audio.fadeOut)}`, '-t', String(duration));
    } else {
      args.push('-c', 'copy');
    }
    args.push('-movflags', '+faststart', path.resolve(options.output));
    await ffmpeg(args).done;
  } finally {
    await Promise.all([browser, ...extra].map(open => open.close()));
    await server.close();
    await rm(work, { recursive: true, force: true });
  }
}

// Seeks to each (scene, time) and runs the page's own checks on that scene.
export async function auditScenes(project: Project, checks: { index: number; time: number }[]): Promise<Record<number, string[]>> {
  const server = await startServer(project);
  const browser = await launchBrowser();
  try {
    const probe = await openPage(browser, server.url);
    const { width, height } = probe.info;
    await probe.page.context().close();
    const { page } = await openPage(browser, server.url, { width, height });
    const results: Record<number, string[]> = {};
    for (const check of checks) {
      await seek(page, check.time);
      results[check.index] = await page.evaluate(index => window.brandreel?.audit?.(index) ?? [], check.index);
    }
    return results;
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function renderStills(project: Project, times: number[], directory: string, options: { guides?: boolean } = {}): Promise<string[]> {
  const server = await startServer(project);
  const browser = await launchBrowser();
  try {
    const probe = await openPage(browser, server.url);
    const { width, height } = probe.info;
    await probe.page.context().close();
    const { page } = await openPage(browser, server.url, { width, height }, options.guides ? '&guides' : '');
    await mkdir(directory, { recursive: true });
    const files: string[] = [];
    for (const time of times) {
      await seek(page, time);
      const file = path.join(directory, `still-${time.toFixed(2)}.png`);
      await page.screenshot({ path: file });
      files.push(file);
    }
    return files;
  } finally {
    await browser.close();
    await server.close();
  }
}

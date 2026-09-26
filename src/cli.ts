#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fillTemplate, loadRows, placeholders, rowName } from './batch.js';
import { info, progress, warn } from './log.js';
import { loadProject, loadProjectFrom, SpecError } from './load.js';
import { renderStills, renderVideo } from './render.js';
import { startServer } from './server.js';
import { FORMATS, STYLE_PACK_NAMES, totalDuration, type FormatName, type StylePackName } from './spec.js';

const HELP = `brandreel: branded motion videos from a JSON script

Usage
  brandreel render   <video.json> [-o out.mp4] [--format 16:9|9:16|1:1|4:5] [--style bold|editorial|soft|tech] [--workers N]
  brandreel batch    <series.json> --data rows.csv|rows.json [--format ...] [--out dir]
                     [--only 1,4-6] [--name "{{id}}"] [--dry-run]
  brandreel stills   <video.json> --at 1,4.5,9 [--out dir] [--format ...] [--guides]
  brandreel preview  <video.json> [--port 4400] [--format ...] [--guides]
  brandreel validate <video.json>
  brandreel templates
  brandreel styles

Needs FFmpeg on PATH and Chrome/Chromium (or BRANDREEL_CHROME=/path/to/chrome).`;

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
  'media': 'A photo with a slow push-in and the headline over a shade'
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

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' }, format: { type: 'string' }, style: { type: 'string' }, workers: { type: 'string' },
      at: { type: 'string' }, out: { type: 'string' }, port: { type: 'string' }, guides: { type: 'boolean' },
      data: { type: 'string' }, only: { type: 'string' }, name: { type: 'string' }, 'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }
    }
  });
  const [command, spec] = positionals;
  if (!command || values.help) { info(HELP); return 0; }
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

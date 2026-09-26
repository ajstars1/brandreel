#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { info, progress, warn } from './log.js';
import { loadProject, SpecError } from './load.js';
import { renderStills, renderVideo } from './render.js';
import { startServer } from './server.js';
import { FORMATS, totalDuration, type FormatName } from './spec.js';

const HELP = `brandreel: branded motion videos from a JSON script

Usage
  brandreel render <video.json> [-o out.mp4] [--format 16:9|9:16|1:1|4:5] [--workers N]
  brandreel stills <video.json> --at 1,4.5,9 [--out dir] [--format ...]
  brandreel preview <video.json> [--port 4400] [--format ...]
  brandreel validate <video.json>
  brandreel templates

Needs FFmpeg on PATH and Chrome/Chromium (or BRANDREEL_CHROME=/path/to/chrome).`;

const TEMPLATE_HELP: Record<string, string> = {
  'statement': 'Bold headline lines, optionally beside a card that gets stamped',
  'strike': 'A line gets crossed out, then the real point lands',
  'logo-reveal': 'Logo spins in with ripples, wordmark and tagline',
  'chat': 'Question typed to your assistant, answer, scored results',
  'counter': 'Big number counts up over a drifting wall of cards',
  'doc-scan': 'Document is scanned and findings pop out beside it',
  'steps': 'Headline beside a numbered path that fills in',
  'end-card': 'Logo lockup, tagline, call to action, fine print'
};

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' }, format: { type: 'string' }, workers: { type: 'string' },
      at: { type: 'string' }, out: { type: 'string' }, port: { type: 'string' }, help: { type: 'boolean', short: 'h' }
    }
  });
  const [command, spec] = positionals;
  if (!command || values.help) { info(HELP); return 0; }
  if (command === 'templates') {
    for (const [name, description] of Object.entries(TEMPLATE_HELP)) info(`  ${name.padEnd(12)} ${description}`);
    return 0;
  }
  if (!spec) { warn(`Missing <video.json>.\n\n${HELP}`); return 1; }
  if (values.format && !(values.format in FORMATS)) { warn(`Unknown format ${values.format}. Use ${Object.keys(FORMATS).join(', ')}.`); return 1; }
  const format = values.format as FormatName | undefined;
  const project = await loadProject(spec, { format });
  const seconds = totalDuration(project.video);

  switch (command) {
    case 'validate':
      info(`✓ ${spec}: ${project.video.scenes.length} scenes, ${seconds.toFixed(1)}s, ${project.video.format} at ${project.video.fps}fps`);
      return 0;
    case 'preview': {
      const server = await startServer(project, Number(values.port ?? 4400));
      info(`Previewing ${spec} at ${server.url}  (space pauses, Ctrl+C stops)`);
      await new Promise(() => undefined);
      return 0;
    }
    case 'stills': {
      const times = (values.at ?? '').split(',').map(Number).filter(Number.isFinite);
      if (!times.length) { warn('Give times with --at 1,4.5,9'); return 1; }
      const files = await renderStills(project, times, values.out ?? path.join(path.dirname(spec), 'out'));
      files.forEach(file => info(file));
      return 0;
    }
    case 'render': {
      const base = path.basename(spec, path.extname(spec));
      const output = values.output ?? path.join(path.dirname(spec), 'out', `${base}-${project.video.format.replace(':', 'x')}.mp4`);
      const started = Date.now();
      await renderVideo(project, {
        output, workers: values.workers ? Number(values.workers) : undefined,
        onProgress: (done, total) => progress(`Rendering ${done}/${total} frames (${Math.floor(done / total * 100)}%)`)
      });
      progress('');
      info(`✓ ${output}  (${seconds.toFixed(1)}s video, rendered in ${((Date.now() - started) / 1000).toFixed(0)}s)`);
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

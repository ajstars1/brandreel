import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Project } from './load.js';

// Serves the render page: the runtime, GSAP, the stylesheets, the video spec and its assets.
// Everything is local; the page never talks to another origin.

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const gsapRoot = path.resolve(path.dirname(createRequire(import.meta.url).resolve('gsap')), '..');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
};

const shell = (project: Project): string => {
  const links = [`/_static/styles.css`, `/_static/styles/${project.video.style.extends}.css`, project.video.style.css]
    .filter((href): href is string => Boolean(href))
    .map(href => `<link rel="stylesheet" href="${href}">`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>brandreel · ${project.video.brand.name}</title>
${links}
<script type="importmap">{ "imports": { "gsap": "/_gsap/index.js" } }</script>
<script type="module" src="/_dist/runtime/index.js"></script>
</head>
<body></body>
</html>`;
};

// Resolves `relative` inside `root`, refusing anything that escapes it.
const inside = (root: string, relative: string): string | null => {
  const file = path.resolve(root, '.' + path.posix.normalize('/' + relative));
  return file.startsWith(root + path.sep) ? file : null;
};

export interface PageServer { url: string; close: () => Promise<void> }

export async function startServer(project: Project, port = 0): Promise<PageServer> {
  const body = JSON.stringify(project.video);
  const page = shell(project);
  const server = http.createServer(async (request, response) => {
    const send = (status: number, data: string | Buffer, type = 'text/plain'): void => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(data);
    };
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);
      if (pathname === '/') return send(200, page, TYPES['.html']);
      if (pathname === '/video.json') return send(200, body, TYPES['.json']);
      let file: string | null | undefined = null;
      if (pathname.startsWith('/_static/')) file = inside(path.join(packageRoot, 'static'), pathname.slice(8));
      else if (pathname.startsWith('/_dist/')) file = inside(path.join(packageRoot, 'dist'), pathname.slice(6));
      else if (pathname.startsWith('/_gsap/')) file = inside(gsapRoot, pathname.slice(6));
      else if (pathname.startsWith('/assets/')) file = project.assets.get(pathname);
      const type = file ? TYPES[path.extname(file).toLowerCase()] : undefined;
      if (!file || !type) return send(404, 'Not found');
      return send(200, await readFile(file), type);
    } catch {
      return send(404, 'Not found');
    }
  });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const { port: bound } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${bound}/`, close: () => new Promise(resolve => { server.close(() => resolve()); }) };
}

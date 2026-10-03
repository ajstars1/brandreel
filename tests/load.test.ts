import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadProject, SpecError } from '../src/load.js';

const example = path.resolve('examples/clearclause/video.json');

describe('loadProject', () => {
  it('rewrites local assets to served URLs', async () => {
    const project = await loadProject(example);
    expect(project.video.brand.logo).toMatch(/^\/assets\/\d+\.svg$/);
    for (const [url, file] of project.assets) {
      expect(url.startsWith('/assets/')).toBe(true);
      expect(path.isAbsolute(file)).toBe(true);
    }
    expect(project.assets.size).toBe(6);
  });

  it('applies a format override', async () => {
    const project = await loadProject(example, { format: '9:16' });
    expect(project.video.format).toBe('9:16');
  });

  it('reports missing assets clearly', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'brandreel-test-'));
    const spec = path.join(dir, 'video.json');
    await writeFile(spec, JSON.stringify({
      brand: { name: 'X', logo: 'missing.png', colors: { primary: '#111111', primaryDark: '#000000', accent: '#222222' }, fonts: { display: { family: 'A' }, body: { family: 'B' } } },
      scenes: [{ template: 'logo-reveal', duration: 2 }]
    }));
    await expect(loadProject(spec)).rejects.toThrow(SpecError);
    await expect(loadProject(spec)).rejects.toThrow(/missing\.png/);
  });

  it('lists every invalid field', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'brandreel-test-'));
    const spec = path.join(dir, 'video.json');
    await writeFile(spec, JSON.stringify({ scenes: [] }));
    await expect(loadProject(spec)).rejects.toThrow(/brand/);
  });

  it('serves the images a custom scene names', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'brandreel-test-'));
    const spec = path.join(dir, 'video.json');
    await writeFile(path.join(dir, 'scene.js'), 'export default (root, api) => api.gsap.timeline();');
    await writeFile(path.join(dir, 'photo.jpg'), 'not really a jpeg');
    await writeFile(spec, JSON.stringify({
      brand: { name: 'X', colors: { primary: '#111111', primaryDark: '#000000', accent: '#222222' }, fonts: { display: { family: 'A' }, body: { family: 'B' } } },
      scenes: [{ template: 'custom', duration: 2, code: 'scene.js', images: { photo: 'photo.jpg' } }]
    }));
    const project = await loadProject(spec);
    const scene = project.video.scenes[0];
    if (scene?.template !== 'custom') throw new Error('expected a custom scene');
    expect(scene.images['photo']).toMatch(/^\/assets\/\d+\.jpg$/);
    expect(project.assets.get(scene.images['photo'] ?? '')).toBe(path.join(dir, 'photo.jpg'));
  });

  it('reports a missing custom-scene image by name', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'brandreel-test-'));
    const spec = path.join(dir, 'video.json');
    await writeFile(path.join(dir, 'scene.js'), 'export default (root, api) => api.gsap.timeline();');
    await writeFile(spec, JSON.stringify({
      brand: { name: 'X', colors: { primary: '#111111', primaryDark: '#000000', accent: '#222222' }, fonts: { display: { family: 'A' }, body: { family: 'B' } } },
      scenes: [{ template: 'custom', duration: 2, code: 'scene.js', images: { photo: 'nope.jpg' } }]
    }));
    await expect(loadProject(spec)).rejects.toThrow(/Image "photo" not found: nope\.jpg/);
  });
});

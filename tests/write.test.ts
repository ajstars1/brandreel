import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { applyLook, assemble, lintSceneCode, lintSceneCss, loadKit, lookSample, relocateAssets, repairPrompt, reviewCustomScenes, scenesFromDraft, userPrompt, writeVideo, SYSTEM_PROMPT, type Draft, type Writer } from '../src/write.js';

const kitFile = path.resolve('examples/clearclause/brand.json');

const goodDraft: Draft = {
  title: 'Cap the renewal price', slug: 'cap-the-renewal-price',
  scenes: [
    { template: 'hook', duration: 3, text: 'Your contract has a *trap* in clause 9.' },
    { template: 'tip', duration: 5.5, kicker: 'Tip 7', headline: ['Cap the', '*renewal price.*'], body: 'Ask for a cap in writing before you sign.' },
    { template: 'end-card', duration: 3.5, tagline: 'Know what you *sign.*', cta: 'Try it free' }
  ]
};

const fakeWriter = (replies: unknown[]): Writer & { calls: Anthropic.MessageParam[][] } => {
  const calls: Anthropic.MessageParam[][] = [];
  return {
    model: 'fake', calls,
    async draft<T>(_system: string, messages: Anthropic.MessageParam[]) {
      calls.push(structuredClone(messages));
      const next = replies.shift();
      return { value: (next ?? null) as T | null, stopReason: 'end_turn', usage: { input: 10, output: 5 } };
    }
  };
};

// A kit with no asset files, so tests can write drafts into a temp folder.
const tempKit = async (): Promise<{ kit: Awaited<ReturnType<typeof loadKit>>['kit']; dir: string; file: string }> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'brandreel-kit-'));
  const file = path.join(dir, 'brand.json');
  await writeFile(file, JSON.stringify({ brand: { name: 'Temp', colors: { primary: '#112233', primaryDark: '#001122', accent: '#445566' }, fonts: { display: { family: 'Anton' }, body: { family: 'Poppins' } } }, voice: { rules: ['Never use em dashes'] }, facts: ['A fact'] }));
  const { kit } = await loadKit(file);
  return { kit, dir, file };
};

const GOOD_CODE = `export default function scene(root, api) {
  const { gsap, h, headline, revealLines } = api;
  const tl = gsap.timeline();
  root.classList.add('demo');
  const title = headline(['Hello', '*world.*']);
  root.append(h('div', 'center', title.node));
  revealLines(tl, title.parts, .2);
  return tl;
}`;

describe('scenesFromDraft', () => {
  it('drops empty fields and coerces value and title per template', () => {
    const scenes = scenesFromDraft({ title: 't', slug: 't', scenes: [
      { template: 'counter', duration: 4, value: '12,000+', title: 'contracts reviewed', kicker: '' },
      { template: 'stat', duration: 4, value: 57, label: 'x', items: [] },
      { template: 'list', duration: 4, title: '5 clauses', items: ['a', 'b'] },
      { template: 'versus', duration: 4, title: ['Old way', 'vs new'], left: { label: 'a', items: ['x'] }, right: { label: 'b', items: ['y'] } }
    ] });
    expect(scenes[0]).toEqual({ template: 'counter', duration: 4, value: 12000, title: 'contracts reviewed' });
    expect(scenes[1]).toEqual({ template: 'stat', duration: 4, value: '57', label: 'x' });
    expect(scenes[2]?.['title']).toEqual(['5 clauses']);
    expect(scenes[3]?.['title']).toBe('Old way vs new');
  });
});

describe('prompts', () => {
  it('puts the brand voice, facts and brief in the user prompt', async () => {
    const { kit } = await loadKit(kitFile);
    const prompt = userPrompt({ brief: 'A reel about auto-renewal traps', kind: 'reel', format: '9:16', seconds: 15, kit });
    expect(prompt).toContain('Brand: Clearclause (@clearclause)');
    expect(prompt).toContain('Never use em dashes');
    expect(prompt).toContain('Facts you may use');
    expect(prompt).toContain('Target length: 15 seconds');
    expect(prompt).toContain('Custom themes available: sunrise');
    expect(prompt.endsWith('A reel about auto-renewal traps')).toBe(true);
    expect(SYSTEM_PROMPT).toContain('end-card');
    expect(SYSTEM_PROMPT).not.toContain('—');
  });

  it('rejects a kit without a brand section', async () => {
    await expect(loadKit(path.resolve('package.json'))).rejects.toThrow(/no "brand" section/);
  });
});

describe('writeVideo', () => {
  it('returns a validated project from a good first draft', async () => {
    const { kit, dir } = await loadKit(kitFile);
    const writer = fakeWriter([goodDraft]);
    const outcome = await writeVideo(writer, { brief: 'x', kind: 'reel', format: '9:16', seconds: 12, kit }, dir);
    expect(outcome.attempts).toBe(1);
    expect(outcome.project.video.scenes).toHaveLength(3);
    expect(outcome.project.video.format).toBe('9:16');
    expect(outcome.project.video.brand.name).toBe('Clearclause');
    expect((outcome.video as { voice?: unknown }).voice).toBeUndefined();
    expect(outcome.usage).toEqual({ input: 10, output: 5 });
  });

  it('feeds validation errors back and accepts the repaired draft', async () => {
    const { kit, dir } = await loadKit(kitFile);
    const bad: Draft = { ...goodDraft, scenes: [{ template: 'hook', duration: 3 }] };   // hook needs text
    const writer = fakeWriter([bad, goodDraft]);
    const outcome = await writeVideo(writer, { brief: 'x', kind: 'reel', format: '9:16', seconds: 12, kit }, dir);
    expect(outcome.attempts).toBe(2);
    const second = writer.calls[1] ?? [];
    expect(second).toHaveLength(3);                       // user, assistant (bad draft), user (repair)
    expect(second[1]?.role).toBe('assistant');
    expect(String(second[2]?.content)).toMatch(/did not validate/);
    expect(String(second[2]?.content)).toMatch(/scenes\.0/);
  });

  it('gives up after the attempt limit with the last problem', async () => {
    const { kit, dir } = await loadKit(kitFile);
    const writer = fakeWriter([null, null]);
    await expect(writeVideo(writer, { brief: 'x', kind: 'reel', format: '9:16', seconds: 12, kit }, dir, 2)).rejects.toThrow(/No valid script after 2 attempts/);
    expect(repairPrompt('boom')).toContain('boom');
  });
});

describe('custom scene code', () => {
  it('accepts a well-formed module', () => {
    expect(lintSceneCode(GOOD_CODE)).toEqual([]);
    expect(lintSceneCss('.demo .x { color: var(--em); }')).toEqual([]);
  });

  it('names every rule a module breaks', () => {
    const problems = lintSceneCode(`import { gsap } from 'gsap';\nexport default async function s(root, api) { setTimeout(() => {}, 1); return Math.random(); }`);
    expect(problems.join(' ')).toMatch(/synchronous/);
    expect(problems.join(' ')).toMatch(/timeline/);
    expect(problems.join(' ')).toMatch(/Math\.random/);
    expect(problems.join(' ')).toMatch(/timers/);
    expect(problems.join(' ')).toMatch(/import statements/);
    expect(lintSceneCode('const x = 1;')).toContain('must `export default function (root, api)`');
    expect(lintSceneCss('@import url(x.css); .a { background: url(https://x/y.png) }')).toHaveLength(2);
  });

  it('assemble writes the module under drafts/<slug> and points the scene at it', async () => {
    const { kit, dir } = await tempKit();
    const draft: Draft = { title: 'Orbit test', slug: 'orbit-test', scenes: [
      { template: 'custom', duration: 4, code: GOOD_CODE, css: '.demo .x { color: red; }' },
      { template: 'end-card', duration: 3, tagline: 'Bye', cta: 'Go' }
    ] };
    const { project, video, files } = await assemble(kit, dir, draft, { format: '9:16' }, 'test');
    expect(files.map(file => path.relative(dir, file))).toEqual(['drafts/orbit-test/scene-1.js', 'drafts/orbit-test/scene-1.css']);
    expect(await readFile(files[0] ?? '', 'utf8')).toContain('export default function scene');
    expect((video['scenes'] as Record<string, unknown>[])[0]?.['code']).toBe('drafts/orbit-test/scene-1.js');
    const first = project.video.scenes[0];
    expect(first?.template === 'custom' && first.code.startsWith('/assets/')).toBe(true);
  });

  it('assemble refuses code that breaks the rules, so the repair loop sees it', async () => {
    const { kit, dir } = await tempKit();
    const draft: Draft = { title: 'Bad', slug: 'bad', scenes: [{ template: 'custom', duration: 4, code: 'export default function s(root, api) { return api.gsap.timeline().to(root, { x: Math.random() }); }' }] };
    await expect(assemble(kit, dir, draft, { format: '9:16' }, 'draft 1')).rejects.toThrow(/scenes\.0\.code: must not use Math\.random/);
  });

  it('writeVideo rejects custom scenes unless they are allowed', async () => {
    const { kit, dir } = await tempKit();
    const custom: Draft = { title: 'C', slug: 'c', scenes: [{ template: 'custom', duration: 4, code: GOOD_CODE }] };
    const plain: Draft = { title: 'P', slug: 'p', scenes: [{ template: 'hook', duration: 3, text: 'Plain' }] };
    const writer = fakeWriter([custom, plain]);
    const outcome = await writeVideo(writer, { brief: 'x', kind: 'reel', format: '9:16', seconds: 10, kit }, dir);
    expect(outcome.attempts).toBe(2);
    expect(String(writer.calls[1]?.[2]?.content)).toMatch(/Custom scenes are not allowed/);
  });

  it('reviewCustomScenes applies a fix from the model and re-validates it', async () => {
    const { kit, dir } = await tempKit();
    const draft: Draft = { title: 'R', slug: 'r', scenes: [{ template: 'custom', duration: 4, code: GOOD_CODE }, { template: 'end-card', duration: 3, tagline: 'Bye', cta: 'Go' }] };
    const first = await assemble(kit, dir, draft, { format: '9:16' }, 'test');
    const fixed = GOOD_CODE.replace("['Hello', '*world.*']", "['Fixed', '*frame.*']");
    const writer = fakeWriter([
      { verdict: 'fix', notes: 'Headline overflowed.', fixes: [{ scene: 1, code: fixed }] },
      { verdict: 'ok', notes: 'Looks right.', fixes: [] }
    ]);
    const stillsCalls: number[][] = [];
    const review = await reviewCustomScenes(writer, { ...first, draft, attempts: 1, usage: { input: 0, output: 0 } }, {
      rounds: 3, kit, kitDir: dir, input: { format: '9:16' }, directory: path.join(dir, 'review'),
      stills: async (_project, times) => { stillsCalls.push(times); return []; }
    });
    expect(review.rounds).toBe(2);
    expect(review.notes).toEqual(['Round 1: Headline overflowed.', 'Round 2: Looks right.']);
    expect(stillsCalls[0]).toEqual([1, 2.4, 3.8]);                       // 25%, 60%, 95% of a 4 s first scene
    expect(review.outcome.draft.scenes[0]?.code).toBe(fixed);
    expect(await readFile(path.join(dir, 'drafts', 'r', 'scene-1.js'), 'utf8')).toContain('Fixed');
    expect(String(writer.calls[0]?.[0]?.content?.[0]?.['text'] ?? JSON.stringify(writer.calls[0]?.[0]?.content))).toMatch(/Frames of the custom scene/);
  });
});

describe('look', () => {
  it('applies a look to a kit and the sample script validates with it', async () => {
    const { kit, dir } = await tempKit();
    const next = applyLook(kit, { extends: 'editorial', css: '#stage { --radius-card: 4px; }', themes: [{ name: 'Sunrise Glow', background: '#ffd48a', background2: '#ff8f6b', text: '#141627', em: '#0b1f66' }], notes: 'n' });
    expect((next as Record<string, unknown>)['style']).toEqual({ extends: 'editorial', css: 'look.css' });
    expect((next as Record<string, unknown>)['themes']).toEqual({ 'sunrise-glow': { background: ['#ffd48a', '#ff8f6b'], text: '#141627', em: '#0b1f66' } });
    await writeFile(path.join(dir, 'look.css'), '#stage { --radius-card: 4px; }');
    const sample = lookSample(next);
    expect(sample.scenes.find(scene => scene.template === 'stat')?.theme).toBe('sunrise-glow');
    const { project } = await assemble(next, dir, sample, { format: '9:16' }, 'look sample');
    expect(project.video.style.extends).toBe('editorial');
    expect(project.video.scenes).toHaveLength(6);
  });
});

describe('relocateAssets', () => {
  it('rewrites relative asset paths when the file is saved in a subfolder', () => {
    const video = { brand: { logo: 'logo.svg', fonts: { display: { files: [{ src: 'fonts/Anton.woff2' }] } } }, style: { extends: 'bold', css: 'look.css' }, audio: { src: 'https://cdn.example/x.mp3' }, scenes: [{ template: 'media', image: 'photo.jpg' }, { template: 'custom', code: 'drafts/x/scene-2.js', css: 'drafts/x/scene-2.css' }] };
    const moved = relocateAssets(video, '/kit', '/kit/drafts') as typeof video;
    expect(moved.brand.logo).toBe('../logo.svg');
    expect(moved.brand.fonts.display.files[0]?.src).toBe('../fonts/Anton.woff2');
    expect(moved.style.css).toBe('../look.css');
    expect(moved.audio.src).toBe('https://cdn.example/x.mp3');
    expect(moved.scenes[0]?.image).toBe('../photo.jpg');
    expect(moved.scenes[1]?.code).toBe('x/scene-2.js');
    expect(relocateAssets(video, '/kit', '/kit')).toBe(video);
  });
});

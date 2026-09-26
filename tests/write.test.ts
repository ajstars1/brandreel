import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { loadKit, relocateAssets, repairPrompt, scenesFromDraft, userPrompt, writeVideo, SYSTEM_PROMPT, type Draft, type Writer } from '../src/write.js';

const kitFile = path.resolve('examples/clearclause/brand.json');

const goodDraft: Draft = {
  title: 'Cap the renewal price', slug: 'cap-the-renewal-price',
  scenes: [
    { template: 'hook', duration: 3, text: 'Your contract has a *trap* in clause 9.' },
    { template: 'tip', duration: 5.5, kicker: 'Tip 7', headline: ['Cap the', '*renewal price.*'], body: 'Ask for a cap in writing before you sign.' },
    { template: 'end-card', duration: 3.5, tagline: 'Know what you *sign.*', cta: 'Try it free' }
  ]
};

const fakeWriter = (replies: Array<Draft | null>): Writer & { calls: Anthropic.MessageParam[][] } => {
  const calls: Anthropic.MessageParam[][] = [];
  return {
    model: 'fake', calls,
    async draft(_system, messages) {
      calls.push(structuredClone(messages));
      const next = replies.shift();
      return { draft: next ?? null, stopReason: 'end_turn', usage: { input: 10, output: 5 } };
    }
  };
};

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

describe('relocateAssets', () => {
  it('rewrites relative asset paths when the file is saved in a subfolder', () => {
    const video = { brand: { logo: 'logo.svg', fonts: { display: { files: [{ src: 'fonts/Anton.woff2' }] } } }, style: { extends: 'bold', css: 'look.css' }, audio: { src: 'https://cdn.example/x.mp3' }, scenes: [{ template: 'media', image: 'photo.jpg' }] };
    const moved = relocateAssets(video, '/kit', '/kit/drafts') as typeof video;
    expect(moved.brand.logo).toBe('../logo.svg');
    expect(moved.brand.fonts.display.files[0]?.src).toBe('../fonts/Anton.woff2');
    expect(moved.style.css).toBe('../look.css');
    expect(moved.audio.src).toBe('https://cdn.example/x.mp3');
    expect(moved.scenes[0]?.image).toBe('../photo.jpg');
    expect(relocateAssets(video, '/kit', '/kit')).toBe(video);
  });
});

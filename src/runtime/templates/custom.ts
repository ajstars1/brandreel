import { gsap } from 'gsap';
import { M, countUp, drift, fadeUp, h, headline, img, kicker, markup, popIn, revealLines } from '../dom.js';
import type { CustomSceneModule, Template } from '../types.js';

// Custom scenes are JS modules loaded by the runtime before the video is built (imports are
// async; building is not). The module gets the same helpers the built-in templates use.
const modules = new Map<string, CustomSceneModule>();

export async function loadCustomModules(urls: string[]): Promise<void> {
  for (const url of new Set(urls)) {
    if (modules.has(url)) continue;
    const mod = await import(/* @vite-ignore */ url) as Partial<CustomSceneModule>;
    if (typeof mod.default !== 'function') throw new Error(`${url}: a custom scene must \`export default function (root, api)\``);
    modules.set(url, mod as CustomSceneModule);
  }
}

export const custom: Template<'custom'> = (root, scene, context) => {
  const mod = modules.get(scene.code);
  if (!mod) throw new Error(`${scene.code}: scene module was not loaded`);
  root.classList.add('custom');
  const timeline = mod.default(root, {
    gsap, brand: context.brand, duration: context.duration, layout: context.layout, motion: M(), props: scene.props, images: scene.images,
    h, img, markup, headline, kicker, revealLines, fadeUp, popIn, countUp, drift
  });
  if (!(timeline instanceof gsap.core.Timeline)) throw new Error(`${scene.code}: the scene function must return a gsap.timeline()`);
  return timeline;
};

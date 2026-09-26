import { gsap } from 'gsap';
import { fadeUp, grain, h, headline, markup, revealLines } from '../dom.js';
import type { Template } from '../types.js';

// A headline beside a numbered path that fills in step by step.
export const steps: Template<'steps'> = (root, scene, { brand }) => {
  const tl = gsap.timeline();
  const title = headline(scene.headline, 'h-xl');
  const caption = scene.caption ? h('div', 'caption', markup(scene.caption)) : null;
  const nums = scene.steps.map((_, i) => h('span', 'num', String(i + 1)));
  const items = scene.steps.map((step, i) => h('div', 'step', nums[i], markup(step)));
  const rail = h('div', 'rail');
  rail.style.height = `${(scene.steps.length - 1) * 150}px`;
  root.append(grain(), h('div', 'split', h('div', 'copy', title.node, caption), h('div', 'visual steps', rail, ...items)));

  revealLines(tl, title.parts, .1, .3);
  if (caption) fadeUp(tl, caption, .9, 16);
  tl.from(items, { x: 60, opacity: 0, stagger: .3, duration: .5, ease: 'power3.out' }, .6);
  tl.from(rail, { scaleY: 0, duration: .45 * scene.steps.length, ease: 'none' }, .8);
  nums.forEach((num, i) => tl.to(num, { backgroundColor: brand.colors.highlight, borderColor: brand.colors.highlight, color: brand.colors.primaryDark, duration: .25 }, 1.3 + i * .45));
  return tl;
};

import { gsap } from 'gsap';
import { M, h, headline, markup, revealLines } from '../dom.js';
import type { Template } from '../types.js';

// "Top 5 ..." — a title beside (or above) items that arrive one at a time.
export const list: Template<'list'> = (root, scene) => {
  const tl = gsap.timeline();
  const title = headline(scene.title);
  const items = scene.items.map((item, i) => h('div', 'list-item',
    h('span', scene.numbered ? 'n' : 'n dot', scene.numbered ? String(i + 1) : ''), h('span', '', markup(item))));
  root.append(h('div', 'split', h('div', 'copy', title.node), h('div', 'visual list', ...items)));
  revealLines(tl, title.parts, .1);
  tl.from(items, { x: 60, opacity: 0, duration: M().enter * .7, ease: M().ease, stagger: Math.max(M().stagger, .22) }, .5);
  tl.from(items.map(item => item.firstChild), { scale: 0, duration: .4, ease: M().pop, stagger: Math.max(M().stagger, .22) }, .6);
  return tl;
};

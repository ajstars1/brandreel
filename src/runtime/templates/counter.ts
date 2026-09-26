import { gsap } from 'gsap';
import { M, countUp, fadeUp, h, markup } from '../dom.js';
import type { Template } from '../types.js';

// A big number counts up over a drifting wall of cards.
export const counter: Template<'counter'> = (root, scene, { duration }) => {
  const tl = gsap.timeline();
  const rows = Array.from({ length: 14 }, (_, r) => {
    const row = h('div', 'tile-row', ...Array.from({ length: 10 }, () => h('div', 'tile')));
    row.style.top = `${r * 178}px`; row.style.left = `${(r % 2) * -160}px`;
    return row;
  });
  const number = h('span', '');
  const count = h('div', 'display count', scene.prefix ? h('span', 'affix', scene.prefix) : null, number, scene.suffix ? h('span', 'affix', scene.suffix) : null);
  const title = h('div', 'count-title', markup(scene.title));
  const subtitle = scene.subtitle ? h('div', 'count-sub', markup(scene.subtitle)) : null;
  root.append(h('div', 'tiles', ...rows), h('div', 'veil'), h('div', 'center', count, title, subtitle));
  tl.from(rows, { opacity: 0, duration: .5, stagger: .04 }, 0);
  tl.to(rows, { x: i => (i % 2 ? -600 : 300), duration, ease: 'none' }, 0);
  tl.from(count, { scale: .7, opacity: 0, duration: M().enter * .8, ease: M().pop }, .15);
  countUp(tl, number, scene.value, n => n.toLocaleString('en-IN'), 1.3, .15);
  fadeUp(tl, title, 1.2, 30);
  if (subtitle) fadeUp(tl, subtitle, 1.6, 30);
  return tl;
};

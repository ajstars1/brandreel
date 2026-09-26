import { gsap } from 'gsap';
import { M, h, markup, sizeFor } from '../dom.js';
import type { Template } from '../types.js';

// Two columns: the old way on the left, the better way on the right, and a VS badge.
export const versus: Template<'versus'> = (root, scene) => {
  const tl = gsap.timeline();
  const column = (side: 'left' | 'right', label: string, items: string[]): HTMLElement =>
    h('div', `vs-col ${side}`, h('div', 'label', markup(label)),
      ...items.map(item => h('div', 'vs-item', h('b', '', side === 'left' ? '×' : '✓'), h('span', '', markup(item)))));
  const left = column('left', scene.left.label, scene.left.items);
  const right = column('right', scene.right.label, scene.right.items);
  const badge = h('div', 'vs-badge', 'VS');
  const title = scene.title ? h('div', `display vs-title ${sizeFor([scene.title])}`, markup(scene.title)) : null;
  root.append(h('div', 'center', title, h('div', 'vs', left, right, badge)));
  if (title) tl.from(title, { y: 30, opacity: 0, duration: M().enter * .7, ease: M().ease }, 0);
  tl.from(left, { x: -80, opacity: 0, duration: M().enter * .8, ease: M().ease }, .2);
  tl.from(right, { x: 80, opacity: 0, duration: M().enter * .8, ease: M().ease }, .3);
  tl.from(badge, { scale: 0, rotation: -90, duration: .5, ease: M().pop }, .7);
  tl.from(left.querySelectorAll('.vs-item'), { opacity: 0, x: -16, duration: .35, stagger: .15 }, .8);
  tl.from(right.querySelectorAll('.vs-item'), { opacity: 0, x: 16, duration: .35, stagger: .15 }, 1.0);
  return tl;
};

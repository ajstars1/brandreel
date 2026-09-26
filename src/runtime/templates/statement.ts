import { gsap } from 'gsap';
import { M, drift, h, headline, revealLines } from '../dom.js';
import type { Template } from '../types.js';

// A bold statement, optionally beside a document card that gets stamped.
export const statement: Template<'statement'> = (root, scene, { duration }) => {
  const tl = gsap.timeline();
  const title = headline(scene.lines, scene.card ? 'h-lg' : undefined);
  if (!scene.card) {
    root.append(h('div', 'center', title.node));
    revealLines(tl, title.parts, .15);
    drift(tl, title.node, duration);
    return tl;
  }
  const bars = [0, 1, 2, 3, 4, 5].map(i => h('div', i % 2 ? 'bar gap' : 'bar'));
  bars.forEach((bar, i) => { bar.style.width = `${[70, 52, 80, 60, 74, 44][i]}%`; });
  const stamp = scene.card.stamp ? h('div', 'stamp', scene.card.stamp) : null;
  const card = h('div', 'card claim', h('div', 'label', scene.card.label), h('div', 'value', scene.card.value), ...bars, stamp);
  root.append(h('div', 'split', h('div', 'copy', title.node), h('div', 'visual', card)));

  revealLines(tl, title.parts, .15);
  tl.from(card, { x: 160, rotation: 6, opacity: 0, duration: M().enter * 1.3, ease: M().ease }, .1);
  tl.from(bars, { scaleX: 0, transformOrigin: '0 50%', stagger: .06, duration: .5, ease: 'power2.out' }, .5);
  if (stamp) {
    tl.fromTo(stamp, { scale: 3.2, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: -12, duration: .32, ease: 'power4.in' }, 1.7);
    tl.to(card, { x: '+=14', duration: .05, yoyo: true, repeat: 5, ease: 'none' }, 2.02);
  }
  drift(tl, title.node, duration);
  return tl;
};

import { gsap } from 'gsap';
import { drift, h, markup } from '../dom.js';
import type { Template } from '../types.js';

// "Not this. This." The first line is crossed out, then the real point lands.
export const strike: Template<'strike'> = (root, scene, { duration }) => {
  const tl = gsap.timeline();
  const struck = h('span', 'strike-before', markup(scene.before));
  const before = h('div', 'display h-lg', struck);
  const after = h('div', 'display h-lg strike-after', markup(scene.after));
  const block = h('div', 'center', before, after);
  root.append(block);
  tl.from(before, { y: 60, opacity: 0, duration: .6, ease: 'power3.out' }, .1);
  // Every wrapped line is crossed out at once (box-decoration-break: clone).
  tl.to(struck, { backgroundSize: '100% 14px', duration: .5, ease: 'power2.inOut' }, 1.0);
  tl.from(after, { y: 60, opacity: 0, duration: .6, ease: 'power3.out' }, 1.35);
  const accents = after.querySelectorAll('.accent');
  if (accents.length) tl.from(accents, { scale: 1.6, duration: .6, ease: 'back.out(2)' }, 1.8);
  drift(tl, block, duration, .04);
  return tl;
};

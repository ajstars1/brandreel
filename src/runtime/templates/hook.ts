import { gsap } from 'gsap';
import { M, drift, h, hookSize, kicker } from '../dom.js';
import { parseMarkup } from '../../markup.js';
import type { Template } from '../types.js';

// The first second of a reel: one line, word by word, as big as it fits.
export const hook: Template<'hook'> = (root, scene, { duration }) => {
  const tl = gsap.timeline();
  // Split into words but keep *accent* runs intact, so a highlighted phrase pops as one.
  const words: HTMLElement[] = [];
  for (const segment of parseMarkup(scene.text)) {
    for (const word of segment.text.split(/\s+/).filter(Boolean)) {
      words.push(h('span', segment.accent ? 'w accent em' : 'w', word));
    }
  }
  const line = h('div', `display hook ${hookSize(scene.text)}`, ...words);
  const label = scene.kicker ? kicker(scene.kicker) : null;
  const block = h('div', 'center', label, line);
  root.append(block);
  if (label) tl.from(label, { opacity: 0, y: 10, duration: .4 }, 0);
  tl.from(words, { scale: .4, opacity: 0, y: 30, duration: M().enter * .55, ease: M().pop, stagger: Math.min(M().stagger * .7, 1.6 / words.length) }, .1);
  drift(tl, line, duration);
  return tl;
};

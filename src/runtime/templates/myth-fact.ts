import { gsap } from 'gsap';
import { M, h, kicker, markup } from '../dom.js';
import type { Template } from '../types.js';

// A myth card is crossed out, then the fact lands beside (landscape) or under it.
export const mythFact: Template<'myth-fact'> = (root, scene) => {
  const tl = gsap.timeline();
  const label = scene.kicker ? kicker(scene.kicker) : null;
  const mythText = h('span', 'text', markup(scene.myth));
  const myth = h('div', 'mf-card mf-myth', h('span', 'tag', scene.mythLabel), h('div', '', mythText));
  const fact = h('div', 'mf-card mf-fact card', h('span', 'tag', scene.factLabel), h('div', 'text', markup(scene.fact)));
  root.append(h('div', 'center', label, h('div', 'mf', myth, fact)));
  if (label) tl.from(label, { opacity: 0, y: 10, duration: .4 }, 0);
  tl.from(myth, { y: 40, opacity: 0, duration: M().enter * .8, ease: M().ease }, .1);
  tl.to(mythText, { backgroundSize: '100% 8px', duration: .5, ease: 'power2.inOut' }, 1.1);
  tl.to(myth, { opacity: .55, duration: .4 }, 1.5);
  tl.from(fact, { y: 60, opacity: 0, scale: .96, duration: M().enter, ease: M().pop }, 1.6);
  const accents = fact.querySelectorAll('.accent');
  if (accents.length) tl.from(accents, { scale: 1.4, duration: .5, ease: M().pop }, 2.1);
  return tl;
};

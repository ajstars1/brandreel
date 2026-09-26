import { gsap } from 'gsap';
import { M, h, img, markup } from '../dom.js';
import type { Template } from '../types.js';

// Logo lockup, tagline, call to action.
export const endCard: Template<'end-card'> = (root, scene, { brand, duration }) => {
  const tl = gsap.timeline();
  const mark = brand.logo ? img(brand.logo) : null;
  const word = h('span', '', brand.name);
  const tagline = h('div', 'display end-tag', markup(scene.tagline));
  const arrow = h('span', 'arrow', '→');
  const cta = h('div', 'cta', markup(scene.cta), arrow);
  const fine = scene.fineprint ? h('div', 'fineprint', markup(scene.fineprint)) : null;
  root.append(h('div', 'center', h('div', 'lockup', mark, word), tagline, cta, fine));
  if (mark) {
    const spin = brand.logoMotion === 'spin';
    tl.fromTo(mark, { scale: 0, rotation: spin ? -360 : 0 }, { scale: 1, rotation: 0, duration: spin ? 1.1 : M().enter, ease: spin ? 'expo.out' : M().pop }, .1);
    if (spin) tl.to(mark, { rotation: 60, duration: Math.max(1, duration - 1.2), ease: 'none' }, 1.2);
  }
  tl.from(word, { clipPath: 'inset(0 100% 0 0)', x: -30, duration: .8, ease: 'power3.out' }, .45);
  tl.from(tagline, { y: 40, opacity: 0, duration: .6, ease: 'power3.out' }, .9);
  tl.from(cta, { y: 40, opacity: 0, scale: .9, duration: .6, ease: M().pop }, 1.4);
  tl.to(arrow, { x: 10, duration: .4, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 2.2);
  if (fine) tl.from(fine, { opacity: 0, duration: .5 }, 1.9);
  return tl;
};

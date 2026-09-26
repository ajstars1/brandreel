import { gsap } from 'gsap';
import { grain, h, img, markup } from '../dom.js';
import type { Template } from '../types.js';

// The logo spins in with ripples, then the wordmark and tagline.
export const logoReveal: Template<'logo-reveal'> = (root, scene, { brand, duration }) => {
  const tl = gsap.timeline();
  const mark = brand.logo ? img(brand.logo, 'logo-mark') : h('div', 'logo-mark fallback');
  const rings = [h('div', 'ring'), h('div', 'ring')];
  const word = h('span', 'reveal', brand.name);
  const tagline = scene.tagline ? h('div', 'tagline', markup(scene.tagline)) : null;
  const block = h('div', 'center', mark, h('div', 'wordmark', h('span', 'clip', word)), tagline);
  root.append(grain(), ...rings, block);
  const spin = brand.logoMotion === 'spin';
  tl.fromTo(mark, { scale: 0, rotation: spin ? -540 : -12 }, { scale: 1, rotation: 0, duration: spin ? 1.4 : .9, ease: spin ? 'expo.out' : 'back.out(1.8)' }, .1);
  tl.fromTo(rings, { scale: .4, opacity: .9 }, { scale: 3.2, opacity: 0, duration: 1.6, stagger: .25, ease: 'power2.out' }, .35);
  tl.from(word, { yPercent: 115, duration: .8, ease: 'power4.out' }, .8);
  if (tagline) tl.from(tagline, { y: 24, opacity: 0, duration: .6, ease: 'power3.out' }, 1.4);
  if (spin) tl.to(mark, { rotation: 90, duration: Math.max(1, duration - 1.5), ease: 'none' }, 1.5);
  else tl.to(mark, { y: -12, duration: Math.max(1, duration - 1.5), ease: 'sine.inOut' }, 1.5);
  return tl;
};

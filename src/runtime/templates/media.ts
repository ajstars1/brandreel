import { gsap } from 'gsap';
import { fadeUp, h, headline, img, markup, revealLines } from '../dom.js';
import type { Template } from '../types.js';

// A photo with a slow push-in and the headline over a shade at the bottom.
export const media: Template<'media'> = (root, scene, { duration }) => {
  const tl = gsap.timeline();
  const picture = img(scene.image, 'media-img');
  const title = headline(scene.headline);
  const caption = scene.caption ? h('div', 'caption', markup(scene.caption)) : null;
  root.append(picture, h('div', 'media-shade'), h('div', 'media-copy', title.node, caption));
  tl.fromTo(picture, { scale: 1.02 }, { scale: 1.1, duration, ease: 'none' }, 0);
  revealLines(tl, title.parts, .2);
  if (caption) fadeUp(tl, caption, .2 + title.parts.length * .18 + .2, 16);
  return tl;
};

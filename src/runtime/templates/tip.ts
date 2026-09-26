import { gsap } from 'gsap';
import { drift, fadeUp, h, headline, kicker, markup, revealLines } from '../dom.js';
import type { Template } from '../types.js';

// A daily tip: kicker, headline, a short body and an optional note.
export const tip: Template<'tip'> = (root, scene, { duration }) => {
  const tl = gsap.timeline();
  const label = scene.kicker ? kicker(scene.kicker) : null;
  const title = headline(scene.headline);
  title.node.classList.add('tip-head');
  const body = scene.body ? h('div', 'body', markup(scene.body)) : null;
  const note = scene.note ? h('div', 'note', markup(scene.note)) : null;
  const block = h('div', 'stack', label, title.node, body, note);
  root.append(block);
  if (label) tl.from(label, { opacity: 0, x: -20, duration: .4 }, 0);
  revealLines(tl, title.parts, .15);
  if (body) fadeUp(tl, body, .15 + title.parts.length * .15 + .3, 24);
  if (note) fadeUp(tl, note, .15 + title.parts.length * .15 + .8, 12);
  drift(tl, block, duration, 0.015);
  return tl;
};

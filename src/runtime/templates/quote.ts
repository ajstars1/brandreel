import { gsap } from 'gsap';
import { M, fadeUp, h, img, markup } from '../dom.js';
import { plainText } from '../../markup.js';
import type { Template } from '../types.js';

// A testimonial or a line worth remembering.
export const quote: Template<'quote'> = (root, scene) => {
  const tl = gsap.timeline();
  const length = plainText(scene.text).length;
  const mark = h('div', 'quote-mark', '“');
  const text = h('div', `quote-text ${length <= 80 ? 'q-lg' : length <= 160 ? 'q-md' : 'q-sm'}`, markup(scene.text));
  const by = h('div', 'quote-by', scene.image ? img(scene.image) : null,
    h('div', '', h('div', 'name', scene.author), scene.role ? h('div', 'role', scene.role) : null));
  root.append(h('div', 'center', mark, text, by));
  tl.from(mark, { scale: .3, opacity: 0, duration: M().enter * .7, ease: M().pop }, 0);
  // Reveal the quote a few words at a time so long quotes read at speaking pace.
  const words = [...text.childNodes].flatMap(node => {
    if (node.nodeType !== Node.TEXT_NODE) return [node as HTMLElement];
    const spans = (node.textContent ?? '').split(/(\s+)/).filter(Boolean).map(part => h('span', '', part));
    node.replaceWith(...spans);
    return spans.filter(span => span.textContent?.trim());
  });
  tl.from(words, { opacity: 0, y: 8, duration: .35, stagger: Math.min(.06, 2 / words.length), ease: 'power2.out' }, .3);
  fadeUp(tl, by, .5 + Math.min(.06, 2 / words.length) * words.length + .2, 20);
  return tl;
};

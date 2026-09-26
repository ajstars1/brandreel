import { gsap } from 'gsap';
import { M, fadeUp, h, headline, markup, revealLines } from '../dom.js';
import type { Template } from '../types.js';

const ICON = { warn: '!', ok: '✓', bad: '×' } as const;
const SPOTS = [[330, 170], [360, 400], [300, 630], [340, 520]] as const;

// A document is scanned and findings pop out beside it.
export const docScan: Template<'doc-scan'> = (root, scene) => {
  const tl = gsap.timeline();
  const widths = [500, 420, 470, 520, 380, 450, 500, 340, 480, 400, 300];
  const bars = widths.map((width, i) => { const bar = h('div', [2, 5, 7].includes(i) ? 'bar gap' : 'bar'); bar.style.width = `${width - 100}px`; return bar; });
  const scanner = h('div', 'scanner');
  const doc = h('div', 'card doc', h('div', 'label', scene.docLabel), h('div', 'title', scene.docTitle), ...bars, scanner);
  const flags = scene.flags.map((flag, i) => {
    const node = h('div', `flag ${flag.tone}`, h('b', '', ICON[flag.tone]), markup(flag.text));
    const [left, top] = SPOTS[i] ?? SPOTS[0];
    node.style.left = `${left}px`; node.style.top = `${top}px`;
    return node;
  });
  const title = headline(scene.headline);
  const caption = scene.caption ? h('div', 'caption', markup(scene.caption)) : null;
  root.append(h('div', 'split reverse', h('div', 'copy', title.node, caption), h('div', 'visual doc-wrap', doc, ...flags)));

  tl.from(doc, { y: 100, rotation: -4, opacity: 0, duration: M().enter, ease: M().ease }, 0);
  revealLines(tl, title.parts, .3, .2);
  if (caption) fadeUp(tl, caption, .9, 16);
  tl.fromTo(scanner, { y: -120 }, { y: 820, duration: 2.2, ease: 'sine.inOut' }, .7);
  flags.forEach((flag, i) => tl.from(flag, { scale: .5, opacity: 0, x: -40, duration: .45, ease: M().pop }, 1.0 + i * .55));
  tl.to(flags, { y: i => (i % 2 ? -8 : 8), duration: 2.5, ease: 'sine.inOut' }, 1.0 + flags.length * .55);
  return tl;
};

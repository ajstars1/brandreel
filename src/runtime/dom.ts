import { gsap } from 'gsap';
import { STYLE_PACKS, type Motion } from '../constants.js';
import { isAccentLine, parseMarkup, plainText } from '../markup.js';

// The active motion preset. The runtime sets it from the style pack before any scene is
// built; every helper and template reads it instead of hardcoding its own numbers.
let motion: Motion = { ...STYLE_PACKS.bold.motion };
export const setMotion = (next: Motion): void => { motion = next; };
export const M = (): Motion => motion;

type Child = Node | string | null | undefined | false;
export type Attrs = string | Record<string, string | number | boolean | null | undefined>;

// h('div', 'a b', ...children) or h('div', { class: 'a b', style: '…', 'data-x': 1 }, ...children).
export const h = (tag: string, attrs: Attrs = '', ...children: Child[]): HTMLElement => {
  const node = document.createElement(tag);
  if (typeof attrs === 'string') { if (attrs) node.className = attrs; }
  else if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class' || key === 'className') node.className = String(value);
      else if (key === 'text') node.textContent = String(value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) if (child) node.append(child);
  return node;
};

export const img = (src: string, className = ''): HTMLImageElement => {
  const node = document.createElement('img');
  node.src = src; node.alt = ''; if (className) node.className = className;
  return node;
};

// Renders markup text: *words* become accent spans.
export const markup = (source: string): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  for (const segment of parseMarkup(source)) {
    fragment.append(segment.accent ? h('span', 'accent em', segment.text) : document.createTextNode(segment.text));
  }
  return fragment;
};

// Picks a headline size from the longest line. Generous on purpose: fitHeadlines() in the
// runtime measures every line once fonts are loaded and shrinks the block if one overflows.
export const sizeFor = (lines: string[]): string => {
  const longest = Math.max(...lines.map(line => plainText(line).length));
  return longest <= 16 ? 'h-xl' : longest <= 26 ? 'h-lg' : longest <= 40 ? 'h-md' : 'h-sm';
};
// Hooks wrap freely, so they can run larger than a fixed-line headline.
export const hookSize = (text: string): string => {
  const length = plainText(text).length;
  return length <= 30 ? 'h-xl' : length <= 60 ? 'h-lg' : 'h-md';
};

// A headline whose lines slide up from behind a mask. Returns the block and its moving parts.
export const headline = (lines: string[], sizeClass = sizeFor(lines)): { node: HTMLElement; parts: HTMLElement[] } => {
  const parts: HTMLElement[] = [];
  const node = h('div', `display fit ${sizeClass}`, ...lines.map(line => {
    const part = h('span', 'reveal', markup(line));
    parts.push(part);
    return h('div', isAccentLine(parseMarkup(line)) ? 'line accent-line' : 'line', h('span', 'clip', part));
  }));
  return { node, parts };
};

export const kicker = (text: string): HTMLElement => h('div', 'kicker', markup(text));

export const revealLines = (tl: gsap.core.Timeline, parts: HTMLElement[], at: number, stagger = motion.stagger): void => {
  tl.from(parts, { yPercent: 115, duration: motion.enter, stagger, ease: motion.ease }, at);
};

export const fadeUp = (tl: gsap.core.Timeline, target: gsap.TweenTarget, at: number, distance = 20): void => {
  tl.from(target, { opacity: 0, y: distance, duration: motion.enter * .7, ease: motion.ease }, at);
};

export const popIn = (tl: gsap.core.Timeline, target: gsap.TweenTarget, at: number, from = .6, stagger = 0): void => {
  tl.from(target, { scale: from, opacity: 0, duration: motion.enter * .6, ease: motion.pop, stagger }, at);
};

// Counts up inside `node`. Driven by the timeline so seeking lands on the exact value.
export const countUp = (tl: gsap.core.Timeline, node: HTMLElement, to: number, format: (n: number) => string, duration: number, at: number): void => {
  const value = { n: 0 };
  node.textContent = format(to);
  tl.fromTo(value, { n: 0 }, { n: to, duration, ease: 'power3.out', onUpdate: () => { node.textContent = format(Math.round(value.n)); } }, at);
};

// Slow push-in so held frames never feel frozen.
export const drift = (tl: gsap.core.Timeline, target: gsap.TweenTarget, duration: number, amount = motion.drift): void => {
  if (amount > 0) tl.fromTo(target, { scale: 1 }, { scale: 1 + amount, duration, ease: 'none' }, 0);
};

export const grain = (): HTMLElement => h('div', 'grain');

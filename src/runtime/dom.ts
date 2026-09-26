import { gsap } from 'gsap';
import { isAccentLine, parseMarkup } from '../markup.js';

type Child = Node | string | null | undefined | false;

export const h = (tag: string, className = '', ...children: Child[]): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
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

// A headline whose lines slide up from behind a mask. Returns the block and its moving parts.
export const headline = (lines: string[], sizeClass: string): { node: HTMLElement; parts: HTMLElement[] } => {
  const parts: HTMLElement[] = [];
  const node = h('div', `display ${sizeClass}`, ...lines.map(line => {
    const part = h('span', 'reveal', markup(line));
    parts.push(part);
    return h('div', isAccentLine(parseMarkup(line)) ? 'line accent-line' : 'line', h('span', 'clip', part));
  }));
  return { node, parts };
};

export const revealLines = (tl: gsap.core.Timeline, parts: HTMLElement[], at: number, stagger = .18): void => {
  tl.from(parts, { yPercent: 115, duration: .7, stagger, ease: 'power4.out' }, at);
};

export const fadeUp = (tl: gsap.core.Timeline, target: gsap.TweenTarget, at: number, distance = 20): void => {
  tl.from(target, { opacity: 0, y: distance, duration: .5, ease: 'power3.out' }, at);
};

// Counts up inside `node`. Driven by the timeline so seeking lands on the exact value.
export const countUp = (tl: gsap.core.Timeline, node: HTMLElement, to: number, format: (n: number) => string, duration: number, at: number): void => {
  const value = { n: 0 };
  node.textContent = format(to);
  tl.fromTo(value, { n: 0 }, { n: to, duration, ease: 'power3.out', onUpdate: () => { node.textContent = format(Math.round(value.n)); } }, at);
};

// Slow push-in so held frames never feel frozen.
export const drift = (tl: gsap.core.Timeline, target: gsap.TweenTarget, duration: number, amount = .03): void => {
  tl.fromTo(target, { scale: 1 }, { scale: 1 + amount, duration, ease: 'none' }, 0);
};

export const grain = (): HTMLElement => h('div', 'grain');

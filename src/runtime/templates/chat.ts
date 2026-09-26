import { gsap } from 'gsap';
import { countUp, fadeUp, h, headline, img, markup, revealLines } from '../dom.js';
import type { Template } from '../types.js';

// A question is typed to the brand's assistant, it thinks, answers, and results slide in.
export const chat: Template<'chat'> = (root, scene, { brand }) => {
  const tl = gsap.timeline();
  const title = headline(scene.headline, 'h-lg');
  const caption = scene.caption ? h('div', 'caption', markup(scene.caption)) : null;
  const askText = h('span', 'ask-text');
  const ask = h('div', 'ask', askText);
  const dots = [h('i'), h('i'), h('i')];
  const typing = h('div', 'typing', ...dots);
  const answer = h('div', 'answer', markup(scene.answer));
  const results = scene.results.map(result => {
    const score = result.score === undefined ? null : h('span', 'score');
    return { node: h('div', 'result', h('span', 'name', result.name), ...result.tags.map(tag => h('span', 'pill', `✓ ${tag}`)), score), score, value: result.score ?? 0 };
  });
  const top = h('div', 'chat-top', brand.logo ? img(brand.logo) : h('span', 'avatar'), scene.assistant, h('span', 'status', h('i'), 'Online'));
  const card = h('div', 'card chat', top, h('div', 'chat-body', ask, h('div', 'answer-slot', answer, typing), ...results.map(result => result.node)));
  root.append(h('div', 'split', h('div', 'copy', title.node, caption), h('div', 'visual', card)));

  const typed = { n: 0 };
  revealLines(tl, title.parts, .1, .2);
  if (caption) fadeUp(tl, caption, .7, 16);
  tl.from(card, { y: 120, opacity: 0, duration: .8, ease: 'power3.out' }, .15);
  tl.from(ask, { scale: .6, opacity: 0, transformOrigin: '100% 100%', duration: .35, ease: 'back.out(1.7)' }, .7);
  tl.to(typed, { n: scene.question.length, duration: Math.min(2, scene.question.length / 45), ease: 'none', onUpdate: () => { askText.textContent = scene.question.slice(0, Math.round(typed.n)); } }, .75);
  const thinking = .75 + Math.min(2, scene.question.length / 45) + .1;
  tl.set(answer, { visibility: 'hidden' }, 0);
  tl.from(typing, { opacity: 0, scale: .6, transformOrigin: '0 100%', duration: .3 }, thinking);
  tl.to(dots, { y: -10, duration: .22, yoyo: true, repeat: 3, stagger: .1, ease: 'sine.inOut' }, thinking + .1);
  tl.to(typing, { opacity: 0, duration: .15 }, thinking + .9);
  tl.set(answer, { visibility: 'visible' }, thinking + .95);
  tl.from(answer, { opacity: 0, y: 16, duration: .4, ease: 'power2.out' }, thinking + .95);
  results.forEach((result, i) => {
    const at = thinking + 1.4 + i * .2;
    tl.from(result.node, { x: -60, opacity: 0, duration: .5, ease: 'power3.out' }, at);
    if (result.score) countUp(tl, result.score, result.value, n => `${n}%`, .8, at + .1);
  });
  return tl;
};

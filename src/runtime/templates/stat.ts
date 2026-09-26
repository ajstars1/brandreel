import { gsap } from 'gsap';
import { M, countUp, drift, fadeUp, h, kicker, markup } from '../dom.js';
import type { Template } from '../types.js';

// One number, as large as it goes. "₹3,40,000" becomes ₹ + a count to 340000 with Indian
// grouping; "57%" counts to 57 and keeps the sign; a value without digits is shown as is.
export const stat: Template<'stat'> = (root, scene, { duration }) => {
  const tl = gsap.timeline();
  const label = scene.kicker ? kicker(scene.kicker) : null;
  const match = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(scene.value);
  const number = h('span', '');
  const value = h('div', 'display stat-value',
    match?.[1] ? h('span', 'affix', match[1]) : null, number, match?.[3] ? h('span', 'affix', match[3]) : null);
  const rule = h('div', 'stat-rule');
  const text = h('div', 'stat-label', markup(scene.label));
  const source = scene.source ? h('div', 'stat-source', markup(scene.source)) : null;
  const block = h('div', 'center', label, value, rule, text, source);
  root.append(block);

  if (label) tl.from(label, { opacity: 0, y: 10, duration: .4 }, 0);
  tl.from(value, { scale: .7, opacity: 0, duration: M().enter * .8, ease: M().pop }, .1);
  if (match) {
    const digits = match[2] ?? '0', decimals = digits.split('.')[1]?.length ?? 0, indian = /\d,\d\d,/.test(digits);
    const target = Number(digits.replace(/,/g, ''));
    const format = (n: number): string => (n / 10 ** decimals).toLocaleString(indian ? 'en-IN' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    countUp(tl, number, Math.round(target * 10 ** decimals), format, 1.4, .15);
  } else {
    number.textContent = scene.value;
  }
  tl.from(rule, { scaleX: 0, duration: .6, ease: 'power2.out' }, .9);
  fadeUp(tl, text, 1.1, 30);
  if (source) fadeUp(tl, source, 1.5, 16);
  drift(tl, value, duration, M().drift * .6);
  return tl;
};

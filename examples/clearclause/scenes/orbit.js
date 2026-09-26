// A custom brandreel scene. The runtime calls `default(root, api)` once, before the first
// frame, and seeks the returned timeline to every frame: keep everything deterministic.
// `api` has gsap, the brand, the scene duration, the motion preset, your props, and the same
// helpers the built-in templates use (h, markup, headline, revealLines, fadeUp, popIn, drift…).
export default function orbit(root, api) {
  const { gsap, h, headline, revealLines, fadeUp, drift, brand, duration, motion, props } = api;
  const labels = props.labels ?? ['One', 'Two', 'Three'];
  const tl = gsap.timeline();

  // Styles stay inside the scene: inline, or in a CSS file scoped to a class you add here.
  root.classList.add('orbit');
  const stage = h('div', 'orbit-stage');
  const core = h('div', 'orbit-core', brand.logo ? api.img(brand.logo) : h('span', 'orbit-dot'));
  const ring = h('div', 'orbit-ring');
  const chips = labels.map((label, i) => {
    const chip = h('div', 'orbit-chip', label);
    chip.style.setProperty('--angle', `${(360 / labels.length) * i}deg`);
    return chip;
  });
  stage.append(ring, ...chips, core);
  const title = headline(props.headline ?? ['Everything', '*in orbit.*']);
  const copy = h('div', 'copy', title.node, props.caption ? h('div', 'caption', props.caption) : null);
  root.append(h('div', 'split', copy, h('div', 'visual', stage)));

  tl.from(core, { scale: 0, duration: motion.enter, ease: motion.pop }, 0);
  tl.from(ring, { scale: .6, opacity: 0, duration: motion.enter, ease: motion.ease }, .1);
  tl.from(chips, { scale: 0, opacity: 0, duration: motion.enter * .7, ease: motion.pop, stagger: motion.stagger }, .4);
  // The whole ring turns slowly for the rest of the scene; chips counter-rotate so text stays upright.
  tl.to(stage, { rotation: 90, duration: Math.max(1, duration - .4), ease: 'none' }, .4);
  tl.to(chips, { rotation: -90, duration: Math.max(1, duration - .4), ease: 'none' }, .4);
  revealLines(tl, title.parts, .2);
  if (props.caption) fadeUp(tl, copy.lastChild, .9, 16);
  drift(tl, copy, duration, .02);
  return tl;
}

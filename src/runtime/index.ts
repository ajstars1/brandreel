import { gsap } from 'gsap';
import { DEFAULT_THEME, dimensions } from '../constants.js';
import type { Brand, Scene, TemplateName, Video } from '../spec.js';
import { h } from './dom.js';
import { TEMPLATES } from './templates/index.js';
import type { Layout, SceneContext, Template } from './types.js';
import type {} from '../page-api.js';

// Builds the whole video as one paused GSAP timeline. Preview mode plays it in a loop;
// the renderer seeks it frame by frame through window.brandreel.


const DESIGN_SHORT_SIDE = 1080;
const WIPE = .5;

const layoutFor = (width: number, height: number): Layout =>
  Math.abs(width - height) < 1 ? 'square' : width > height ? 'landscape' : height / width > 1.3 ? 'portrait' : 'square';

function applyBrand(stage: HTMLElement, brand: Brand): void {
  const { colors, fonts } = brand;
  const vars: Record<string, string> = {
    '--primary': colors.primary, '--primary-dark': colors.primaryDark, '--accent': colors.accent, '--highlight': colors.highlight,
    '--ink': colors.ink, '--paper': colors.paper, '--night': colors.night,
    '--positive': colors.positive, '--warning': colors.warning, '--negative': colors.negative,
    '--font-display': `"${fonts.display.family}"`, '--font-body': `"${fonts.body.family}"`,
    '--font-accent': `"${(fonts.accent ?? fonts.body).family}"`,
    '--display-case': fonts.display.uppercase ? 'uppercase' : 'none',
    '--display-weight': String(fonts.display.files[0]?.weight ?? 700)
  };
  for (const [name, value] of Object.entries(vars)) stage.style.setProperty(name, value);
  const faces = [fonts.display, fonts.body, fonts.accent].flatMap(font => font ? font.files.map(file =>
    `@font-face { font-family: "${font.family}"; src: url("${file.src}"); font-weight: ${file.weight}; font-style: ${file.style}; font-display: block; }`) : []);
  document.head.append(h('style', '', faces.join('\n')));
}

function buildScene<T extends TemplateName>(root: HTMLElement, scene: Extract<Scene, { template: T }>, context: SceneContext): gsap.core.Timeline {
  const template = TEMPLATES[scene.template] as Template<T>;
  return template(root, scene, context);
}

function build(video: Video, stage: HTMLElement, layout: Layout): gsap.core.Timeline {
  const master = gsap.timeline({ paused: true });
  let start = 0;
  video.scenes.forEach((scene, index) => {
    const root = h('section', `scene theme-${scene.theme ?? DEFAULT_THEME[scene.template]}`);
    stage.append(root);
    const timeline = buildScene(root, scene, { brand: video.brand, duration: scene.duration, layout });
    // Squeeze the entrances when a scene is shorter than its template's natural length.
    if (timeline.duration() > scene.duration) timeline.timeScale(timeline.duration() / scene.duration);
    master.set(root, { visibility: 'visible', zIndex: index + 1 }, start);
    const enter = index === 0 ? 0 : video.transition === 'cut' ? 0 : .15;
    if (index > 0 && video.transition === 'wipe') master.fromTo(root, { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: WIPE, ease: 'power3.inOut' }, start);
    if (index > 0 && video.transition === 'fade') master.fromTo(root, { opacity: 0 }, { opacity: 1, duration: WIPE, ease: 'power1.inOut' }, start);
    master.add(timeline, start + enter);
    const end = start + scene.duration;
    if (index < video.scenes.length - 1) master.set(root, { visibility: 'hidden' }, end + WIPE);
    start = end;
  });
  if (master.duration() < start) master.to({}, { duration: start - master.duration() });
  return master;
}

async function whenLoaded(stage: HTMLElement): Promise<void> {
  const images = [...stage.querySelectorAll('img')].map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => { image.onload = image.onerror = () => resolve(); }));
  await Promise.all([document.fonts.ready, ...images]);
  // Touch every font so lazily loaded faces are ready before the first frame.
  await Promise.all([...document.fonts].map(face => face.load().catch(() => undefined)));
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const video = await (await fetch('/video.json')).json() as Video;
  const { width, height } = dimensions(video.format);
  const design = DESIGN_SHORT_SIDE / Math.min(width, height);
  const layout = layoutFor(width, height);
  const stage = h('div', layout);
  stage.id = 'stage';
  stage.style.width = `${width * design}px`; stage.style.height = `${height * design}px`;
  document.body.append(stage);
  applyBrand(stage, video.brand);
  const master = build(video, stage, layout);
  await whenLoaded(stage);
  const duration = video.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const fit = (w: number, hgt: number): void => {
    const scale = Math.min(w / (width * design), hgt / (height * design));
    stage.style.transform = `translate(${(w - width * design * scale) / 2}px, ${(hgt - height * design * scale) / 2}px) scale(${scale})`;
  };

  if (params.has('render')) {
    fit(width, height);
    window.brandreel = { duration, width, height, seek: time => { master.seek(time, false); } };
    return;
  }
  const resize = (): void => fit(innerWidth, innerHeight);
  addEventListener('resize', resize); resize();
  master.eventCallback('onComplete', () => { master.restart(); });
  master.play();
  addEventListener('keydown', event => { if (event.code === 'Space') master.paused(!master.paused()); });
  window.brandreel = { duration, width, height, seek: time => { master.seek(time, false); } };
}

start().catch((error: unknown) => {
  window.brandreel = { duration: 0, width: 0, height: 0, seek: () => undefined, error: error instanceof Error ? error.message : String(error) };
  document.body.append(h('pre', '', `brandreel: ${window.brandreel.error}`));
});

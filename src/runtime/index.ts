import { gsap } from 'gsap';
import { BUILTIN_THEMES, DEFAULT_THEME, SAFE_AREA, STYLE_PACKS, dimensions } from '../constants.js';
import type { Brand, Scene, TemplateName, Theme, Video } from '../spec.js';
import { h, img, setMotion } from './dom.js';
import { TEMPLATES } from './templates/index.js';
import { loadCustomModules } from './templates/custom.js';
import type { Layout, SceneContext, Template } from './types.js';
import type {} from '../page-api.js';

// Builds the whole video as one paused GSAP timeline. Preview mode plays it in a loop;
// the renderer seeks it frame by frame through window.brandreel.

const DESIGN_SHORT_SIDE = 1080;
const WIPE = .5;

const layoutFor = (width: number, height: number): Layout =>
  Math.abs(width - height) < 1 ? 'square' : width > height ? 'landscape' : height / width > 1.3 ? 'portrait' : 'square';

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * .299 + ((n >> 8 & 255) * .587) + (n & 255) * .114) / 255;
};

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

// A custom theme becomes the same variables the built-in theme classes set, chosen so cards
// and buttons stay readable whether the background is light or dark.
function customThemeVars(theme: Theme, brand: Brand): Record<string, string> {
  const [from, to] = Array.isArray(theme.background) ? theme.background : [theme.background, theme.background];
  const dark = luminance(from) < .5;
  return {
    '--scene-bg': from === to ? from : `linear-gradient(160deg, ${from}, ${to})`,
    '--scene-fg': theme.text,
    '--em': theme.em ?? (dark ? brand.colors.accent : brand.colors.primary),
    '--soft': theme.soft ?? `color-mix(in srgb, ${theme.text} 62%, ${from})`,
    '--surface': theme.surface ?? '#ffffff',
    '--surface-fg': theme.surfaceText ?? brand.colors.ink,
    '--rule': dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.14)',
    '--cta-bg': dark ? '#ffffff' : brand.colors.primary, '--cta-fg': dark ? brand.colors.primaryDark : '#ffffff',
    '--cta-arrow-bg': dark ? brand.colors.primary : '#ffffff', '--cta-arrow-fg': dark ? '#ffffff' : brand.colors.primary
  };
}

function sceneRoot(video: Video, scene: Scene): HTMLElement {
  const name = scene.theme ?? DEFAULT_THEME[scene.template];
  if ((BUILTIN_THEMES as readonly string[]).includes(name)) return h('section', `scene theme-${name}`);
  const root = h('section', 'scene theme-custom');
  const custom = video.themes[name];
  if (custom) for (const [key, value] of Object.entries(customThemeVars(custom, video.brand))) root.style.setProperty(key, value);
  return root;
}

function buildScene<T extends TemplateName>(root: HTMLElement, scene: Extract<Scene, { template: T }>, context: SceneContext): gsap.core.Timeline {
  const template = TEMPLATES[scene.template] as Template<T>;
  return template(root, scene, context);
}

const sceneRoots: HTMLElement[] = [];

// What a designer would spot at a glance, expressed as checks. Used by the review loop so
// the model gets facts about the rendered frame, not only pixels.
function auditScene(stage: HTMLElement, index: number): string[] {
  const root = sceneRoots[index];
  if (!root) return [`scene ${index + 1}: not found`];
  const problems: string[] = [];
  const frame = stage.getBoundingClientRect();
  const scale = frame.width / stage.offsetWidth;   // stage is scaled to the viewport
  const all = [...root.querySelectorAll<HTMLElement>('*')];
  if (all.some(node => node.className === '[object Object]')) problems.push('h() was called with an object where a class string was expected, so no classes were applied; use h(tag, { class: "…" }) or h(tag, "…")');
  const visible = all.filter(node => {
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const textual = visible.filter(node => [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()));
  if (!textual.length) problems.push('no visible text in the scene');
  const tiny = textual.filter(node => parseFloat(getComputedStyle(node).fontSize) < 22);
  if (tiny.length) problems.push(`${tiny.length} text element${tiny.length > 1 ? 's' : ''} smaller than 22px (design px): "${(tiny[0]?.textContent ?? '').trim().slice(0, 40)}"…`);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const node of textual) {
    const rect = node.getBoundingClientRect();
    left = Math.min(left, rect.left); top = Math.min(top, rect.top); right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
    if (rect.left < frame.left - 2 || rect.right > frame.right + 2 || rect.top < frame.top - 2 || rect.bottom > frame.bottom + 2) {
      problems.push(`text runs outside the frame: "${(node.textContent ?? '').trim().slice(0, 40)}"`);
      break;
    }
  }
  if (textual.length) {
    const area = ((right - left) * (bottom - top)) / (frame.width * frame.height);
    if (area < .06) problems.push(`the content occupies ${Math.round(area * 100)}% of the frame, bunched at ${Math.round((left - frame.left) / scale)},${Math.round((top - frame.top) / scale)}; the layout has probably collapsed`);
  }
  const safeTop = parseFloat(getComputedStyle(stage).getPropertyValue('--safe-top')) || 0;
  const safeBottom = parseFloat(getComputedStyle(stage).getPropertyValue('--safe-bottom')) || 0;
  if (safeTop && textual.some(node => node.getBoundingClientRect().top < frame.top + safeTop * scale - 1)) problems.push('text sits in the top safe band that app controls cover');
  if (safeBottom && textual.some(node => node.getBoundingClientRect().bottom > frame.bottom - safeBottom * scale + 1)) problems.push('text sits in the bottom safe band that app controls cover');
  return problems;
}

function build(video: Video, stage: HTMLElement, layout: Layout): gsap.core.Timeline {
  const pack = STYLE_PACKS[video.style.extends];
  setMotion({ ...pack.motion, ...video.style.motion });
  const transition = video.transition ?? pack.transition;
  const master = gsap.timeline({ paused: true });
  let start = 0;
  video.scenes.forEach((scene, index) => {
    const root = sceneRoot(video, scene);
    stage.append(root);
    sceneRoots.push(root);
    const timeline = buildScene(root, scene, { brand: video.brand, duration: scene.duration, layout });
    // Squeeze the entrances when a scene is shorter than its template's natural length.
    if (timeline.duration() > scene.duration) timeline.timeScale(timeline.duration() / scene.duration);
    master.set(root, { visibility: 'visible', zIndex: index + 1 }, start);
    const enter = index === 0 || transition === 'cut' ? 0 : .15;
    if (index > 0 && transition === 'wipe') master.fromTo(root, { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: WIPE, ease: 'power3.inOut' }, start);
    if (index > 0 && transition === 'fade') master.fromTo(root, { opacity: 0 }, { opacity: 1, duration: WIPE, ease: 'power1.inOut' }, start);
    master.add(timeline, start + enter);
    const end = start + scene.duration;
    if (index < video.scenes.length - 1) master.set(root, { visibility: 'hidden' }, end + WIPE);
    start = end;
  });
  if (master.duration() < start) master.to({}, { duration: start - master.duration() });

  // Reel furniture sits above every scene.
  const handle = video.brand.handle;
  if (handle && (video.watermark ?? true)) {
    stage.append(h('div', video.brand.logo ? 'watermark' : 'watermark no-logo', video.brand.logo ? img(video.brand.logo) : null, handle));
  }
  if (video.progressBar) {
    const fill = h('i');
    stage.append(h('div', 'progress', fill));
    master.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: start, ease: 'none' }, 0);
  }
  return master;
}

// Authored headline lines must never wrap. Once fonts are in, measure each line at its natural
// width and shrink the whole block until the widest line fits its column.
function fitHeadlines(stage: HTMLElement): void {
  for (const block of stage.querySelectorAll<HTMLElement>('.display.fit')) {
    const lines = [...block.querySelectorAll<HTMLElement>('.line')];
    const available = block.clientWidth;
    if (!lines.length || !available) continue;
    const initial = parseFloat(getComputedStyle(block).fontSize);
    let size = initial;
    for (let pass = 0; pass < 6; pass++) {
      const widest = Math.max(...lines.map(line => line.scrollWidth));
      if (widest <= available) break;
      size = Math.floor(size * (available / widest) * .97);
      if (size < initial * .4) { lines.forEach(line => { line.style.whiteSpace = 'normal'; }); break; }
      block.style.fontSize = `${size}px`;
    }
  }
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
  const safe = layout === 'portrait' ? (video.safeArea ? SAFE_AREA : { top: 150, bottom: 150 }) : { top: 0, bottom: 0 };
  stage.style.setProperty('--safe-top', `${safe.top}px`); stage.style.setProperty('--safe-bottom', `${safe.bottom}px`);
  document.body.append(stage);
  applyBrand(stage, video.brand);
  const customScenes = video.scenes.filter(scene => scene.template === 'custom');
  await Promise.all(customScenes.flatMap(scene => scene.css ? [new Promise<void>((resolve, reject) => {
    const link = h('link') as HTMLLinkElement;
    link.rel = 'stylesheet'; link.href = scene.css as string;
    link.onload = () => resolve(); link.onerror = () => reject(new Error(`${scene.css}: stylesheet failed to load`));
    document.head.append(link);
  })] : []));
  await loadCustomModules(customScenes.map(scene => scene.code));
  const master = build(video, stage, layout);
  if (params.has('guides')) stage.append(h('div', 'guides'));
  await whenLoaded(stage);
  fitHeadlines(stage);
  const duration = video.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const fit = (w: number, hgt: number): void => {
    const scale = Math.min(w / (width * design), hgt / (height * design));
    stage.style.transform = `translate(${(w - width * design * scale) / 2}px, ${(hgt - height * design * scale) / 2}px) scale(${scale})`;
  };
  window.brandreel = { duration, width, height, seek: time => { master.seek(time, false); }, audit: index => auditScene(stage, index) };

  if (params.has('render')) { fit(width, height); return; }
  const resize = (): void => fit(innerWidth, innerHeight);
  addEventListener('resize', resize); resize();
  master.eventCallback('onComplete', () => { master.restart(); });
  master.play();
  addEventListener('keydown', event => { if (event.code === 'Space') master.paused(!master.paused()); });
}

start().catch((error: unknown) => {
  window.brandreel = { duration: 0, width: 0, height: 0, seek: () => undefined, error: error instanceof Error ? error.message : String(error) };
  document.body.append(h('pre', '', `brandreel: ${window.brandreel.error}`));
});

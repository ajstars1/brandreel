import type { gsap } from 'gsap';
import type { Motion } from '../constants.js';
import type { Brand, SceneOf, TemplateName } from '../spec.js';

export type Layout = 'landscape' | 'portrait' | 'square';

export interface SceneContext {
  brand: Brand;
  duration: number;
  layout: Layout;
}

// A template fills `root` (a full-frame scene element) and returns a timeline that starts at
// 0. The runtime places it on the master timeline and fits it to the scene's duration.
export type Template<T extends TemplateName> = (root: HTMLElement, scene: SceneOf<T>, context: SceneContext) => gsap.core.Timeline;

// What a custom scene module receives: `export default function (root, api) { ...; return timeline }`.
export interface CustomSceneApi {
  gsap: typeof gsap;
  brand: Brand;
  duration: number;
  layout: Layout;
  motion: Motion;
  props: Record<string, unknown>;
  h: (tag: string, className?: string, ...children: Array<Node | string | null | undefined | false>) => HTMLElement;
  img: (src: string, className?: string) => HTMLImageElement;
  markup: (source: string) => DocumentFragment;
  headline: (lines: string[], sizeClass?: string) => { node: HTMLElement; parts: HTMLElement[] };
  kicker: (text: string) => HTMLElement;
  revealLines: (tl: gsap.core.Timeline, parts: HTMLElement[], at: number, stagger?: number) => void;
  fadeUp: (tl: gsap.core.Timeline, target: gsap.TweenTarget, at: number, distance?: number) => void;
  popIn: (tl: gsap.core.Timeline, target: gsap.TweenTarget, at: number, from?: number, stagger?: number) => void;
  countUp: (tl: gsap.core.Timeline, node: HTMLElement, to: number, format: (n: number) => string, duration: number, at: number) => void;
  drift: (tl: gsap.core.Timeline, target: gsap.TweenTarget, duration: number, amount?: number) => void;
}
export type CustomSceneModule = { default: (root: HTMLElement, api: CustomSceneApi) => gsap.core.Timeline };

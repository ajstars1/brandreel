import type { gsap } from 'gsap';
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

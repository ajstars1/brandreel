import type { TemplateName } from '../../spec.js';
import type { Template } from '../types.js';
import { chat } from './chat.js';
import { counter } from './counter.js';
import { docScan } from './doc-scan.js';
import { endCard } from './end-card.js';
import { logoReveal } from './logo-reveal.js';
import { statement } from './statement.js';
import { steps } from './steps.js';
import { strike } from './strike.js';

export const TEMPLATES: { [K in TemplateName]: Template<K> } = {
  'statement': statement,
  'strike': strike,
  'logo-reveal': logoReveal,
  'chat': chat,
  'counter': counter,
  'doc-scan': docScan,
  'steps': steps,
  'end-card': endCard
};

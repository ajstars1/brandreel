import type { TemplateName } from '../../spec.js';
import type { Template } from '../types.js';
import { chat } from './chat.js';
import { counter } from './counter.js';
import { docScan } from './doc-scan.js';
import { endCard } from './end-card.js';
import { hook } from './hook.js';
import { list } from './list.js';
import { logoReveal } from './logo-reveal.js';
import { media } from './media.js';
import { mythFact } from './myth-fact.js';
import { quote } from './quote.js';
import { stat } from './stat.js';
import { statement } from './statement.js';
import { steps } from './steps.js';
import { strike } from './strike.js';
import { tip } from './tip.js';
import { versus } from './versus.js';

export const TEMPLATES: { [K in TemplateName]: Template<K> } = {
  'statement': statement,
  'strike': strike,
  'logo-reveal': logoReveal,
  'chat': chat,
  'counter': counter,
  'doc-scan': docScan,
  'steps': steps,
  'end-card': endCard,
  'hook': hook,
  'tip': tip,
  'myth-fact': mythFact,
  'stat': stat,
  'quote': quote,
  'list': list,
  'versus': versus,
  'media': media
};

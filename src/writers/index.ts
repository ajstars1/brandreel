import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import type { Writer } from '../write.js';
import { ANTHROPIC_DEFAULT_MODEL, anthropicWriter } from './anthropic.js';
import { claudeCodeWriter } from './claude-code.js';
import { GEMINI_DEFAULT_MODEL, geminiWriter } from './gemini.js';

// Which model writes the scripts. The renderer never calls a model; only `write` and `look` do.
export type Backend = 'anthropic' | 'gemini' | 'claude-code';
export const BACKENDS: Backend[] = ['anthropic', 'gemini', 'claude-code'];

export const DEFAULT_MODELS: Record<Backend, string | undefined> = {
  anthropic: ANTHROPIC_DEFAULT_MODEL,
  gemini: GEMINI_DEFAULT_MODEL,
  'claude-code': undefined   // whatever the Claude Code session is set to
};

export const commandExists = (command: string, envPath = process.env['PATH'] ?? ''): boolean =>
  envPath.split(path.delimiter).some(dir => { try { accessSync(path.join(dir, command), constants.X_OK); return true; } catch { return false; } });

// Explicit choice first (BRANDREEL_WRITER), then whichever credentials are present, then a
// logged-in Claude Code CLI.
export function detectBackend(env: NodeJS.ProcessEnv = process.env, hasClaudeCli: boolean = commandExists('claude')): Backend | null {
  const explicit = env['BRANDREEL_WRITER'];
  if (explicit && (BACKENDS as string[]).includes(explicit)) return explicit as Backend;
  if (env['ANTHROPIC_API_KEY'] || env['ANTHROPIC_AUTH_TOKEN']) return 'anthropic';
  if (env['GEMINI_API_KEY'] || env['GOOGLE_API_KEY']) return 'gemini';
  if (hasClaudeCli) return 'claude-code';
  return null;
}

export function createWriter(backend: Backend, model?: string): Writer {
  switch (backend) {
    case 'anthropic': return anthropicWriter(model ?? ANTHROPIC_DEFAULT_MODEL);
    case 'gemini': return geminiWriter(model ?? GEMINI_DEFAULT_MODEL);
    case 'claude-code': return claudeCodeWriter(model);
  }
}

export const NO_BACKEND_HELP = `No model backend available. Use one of:
  • Anthropic API:   export ANTHROPIC_API_KEY=...        (or \`ant auth login\`)
  • Google Gemini:   export GEMINI_API_KEY=...
  • Claude Code:     install the claude CLI and log in; brandreel runs \`claude -p\` on your subscription
Pick one explicitly with --via anthropic|gemini|claude-code or BRANDREEL_WRITER. Without any model, use --show-prompt and --from.`;

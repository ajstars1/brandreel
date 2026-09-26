import { spawn } from 'node:child_process';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { Writer } from '../write.js';
import { flattenMessages, plainJsonSchema } from './flatten.js';

// Claude Code's print mode (`claude -p`), so a Claude subscription can write scripts without an
// API key. The CLI must be installed and logged in. The conversation is sent as one stream-json
// user message on stdin, which is the only print-mode input that carries images; the answer is
// the `result` event of the stream-json output, with `structured_output` from --json-schema.

const OUTPUT = z.object({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional(), cache_read_input_tokens: z.number().optional(), cache_creation_input_tokens: z.number().optional() }).optional()
});

// Accepts a single JSON object (--output-format json) or NDJSON (stream-json), where the last
// `result` event carries the answer.
export function parseClaudeCodeOutput<T>(stdout: string, schema: z.ZodType<T>): { value: T | null; stopReason: string; usage: { input: number; output: number } } {
  const events = stdout.split('\n').map(line => line.trim()).filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; } });
  let raw: unknown = events.reverse().find(event => event['type'] === 'result' || event['type'] === undefined);
  if (!raw) {
    try { raw = JSON.parse(stdout); } catch { throw new Error(`claude -p returned no result event; the output was not JSON: ${stdout.slice(0, 200)}`); }
    if ((raw as Record<string, unknown>)['type'] !== undefined && (raw as Record<string, unknown>)['type'] !== 'result') throw new Error(`claude -p returned no result event: ${stdout.slice(0, 200)}`);
  }
  const output = OUTPUT.parse(raw);
  if (output.is_error) throw new Error(`claude -p failed: ${output.result ?? output.subtype ?? 'unknown error'}`);
  let candidate: unknown = output.structured_output;
  if (candidate === undefined && output.result) {
    const text = output.result.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
    try { candidate = JSON.parse(text); } catch { candidate = undefined; }
  }
  const parsed = candidate === undefined ? null : schema.safeParse(candidate);
  const usage = output.usage;
  return {
    value: parsed?.success ? parsed.data : null,
    stopReason: 'end_turn',
    usage: { input: (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0), output: usage?.output_tokens ?? 0 }
  };
}

export function claudeCodeArgs(system: string, schema: Record<string, unknown>, model: string | undefined): string[] {
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--json-schema', JSON.stringify(schema), '--system-prompt', system, '--tools', '', '--no-session-persistence'];
  if (model) args.push('--model', model);
  return args;
}

// The one stdin line: the flattened conversation as a user message with text and image blocks.
export function claudeCodeStdin(messages: Anthropic.MessageParam[]): string {
  const content = flattenMessages(messages).map(part => part.kind === 'text'
    ? { type: 'text', text: part.text }
    : { type: 'image', source: { type: 'base64', media_type: part.mediaType, data: part.data } });
  return JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
}

export function claudeCodeWriter(model?: string, command = 'claude'): Writer {
  return {
    model: model ?? 'claude-code default',
    async draft(system, messages, schema) {
      const args = claudeCodeArgs(system, plainJsonSchema(z.toJSONSchema(schema) as Record<string, unknown>), model);
      const stdout = await run(command, args, claudeCodeStdin(messages));
      return parseClaudeCodeOutput(stdout, schema);
    }
  };
}

function run(command: string, args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // CLAUDECODE is unset so this works from inside a Claude Code session too.
    const env = { ...process.env };
    delete env['CLAUDECODE'];
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', error => reject(new Error(`Could not start "${command}" (${error.message}). Install Claude Code and run \`claude\` once to log in.`)));
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`claude -p exited with ${code}: ${(stderr || stdout).trim().slice(0, 500)}`)));
    child.stdin.end(stdin);
  });
}

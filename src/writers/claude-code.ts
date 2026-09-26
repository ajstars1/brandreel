import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { Writer } from '../write.js';
import { flattenMessages, plainJsonSchema, promptText } from './flatten.js';

// Claude Code's print mode (`claude -p`), so a Claude subscription can write scripts without an
// API key. The CLI must be installed and logged in. Frames for a review round are written to
// files the session can Read; everything else travels in the prompt.

const OUTPUT = z.object({
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional(), cache_read_input_tokens: z.number().optional(), cache_creation_input_tokens: z.number().optional() }).optional()
});

export function parseClaudeCodeOutput<T>(stdout: string, schema: z.ZodType<T>): { value: T | null; stopReason: string; usage: { input: number; output: number } } {
  let raw: unknown;
  try { raw = JSON.parse(stdout); } catch { throw new Error(`claude -p returned something that is not JSON: ${stdout.slice(0, 200)}`); }
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

export function claudeCodeArgs(system: string, prompt: string, schema: Record<string, unknown>, model: string | undefined, imageDir: string | null): string[] {
  const args = ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--system-prompt', system, '--no-session-persistence'];
  if (imageDir) args.push('--tools', 'Read', '--allowedTools', 'Read', '--add-dir', imageDir);
  else args.push('--tools', '');
  if (model) args.push('--model', model);
  return args;
}

export function claudeCodeWriter(model?: string, command = 'claude'): Writer {
  return {
    model: model ?? 'claude-code default',
    async draft(system, messages, schema) {
      const parts = flattenMessages(messages);
      const images = parts.filter(part => part.kind === 'image');
      let imageDir: string | null = null;
      const files: string[] = [];
      if (images.length) {
        imageDir = await mkdtemp(path.join(process.cwd(), '.brandreel-review-'));
        for (const [index, image] of images.entries()) {
          if (image.kind !== 'image') continue;
          const file = path.join(imageDir, `frame-${index + 1}.${image.mediaType === 'image/png' ? 'png' : 'jpg'}`);
          await writeFile(file, Buffer.from(image.data, 'base64'));
          files.push(file);
        }
      }
      const prompt = promptText(parts, n => `[image ${n}: read the file ${files[n - 1] ?? ''} to see it]`);
      const args = claudeCodeArgs(system, prompt, plainJsonSchema(z.toJSONSchema(schema) as Record<string, unknown>), model, imageDir);
      try {
        const stdout = await run(command, args);
        return parseClaudeCodeOutput(stdout, schema);
      } finally {
        if (imageDir) await rm(imageDir, { recursive: true, force: true });
      }
    }
  };
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // CLAUDECODE is unset so this works from inside a Claude Code session too.
    const env = { ...process.env };
    delete env['CLAUDECODE'];
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', error => reject(new Error(`Could not start "${command}" (${error.message}). Install Claude Code and run \`claude\` once to log in.`)));
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`claude -p exited with ${code}: ${(stderr || stdout).trim().slice(0, 500)}`)));
  });
}

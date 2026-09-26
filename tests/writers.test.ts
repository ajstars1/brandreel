import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { flattenMessages, plainJsonSchema, promptText } from '../src/writers/flatten.js';
import { geminiRequest } from '../src/writers/gemini.js';
import { claudeCodeArgs, parseClaudeCodeOutput } from '../src/writers/claude-code.js';
import { detectBackend, DEFAULT_MODELS } from '../src/writers/index.js';

const schema = z.object({ answer: z.string(), n: z.number().optional() });
const messages: Anthropic.MessageParam[] = [
  { role: 'user', content: 'Write it.' },
  { role: 'assistant', content: '{"answer":"draft"}' },
  { role: 'user', content: [{ type: 'text', text: 'Frames:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }, { type: 'text', text: 'Fix it.' }] }
];

describe('detectBackend', () => {
  it('prefers an explicit choice, then credentials, then the Claude CLI', () => {
    expect(detectBackend({ BRANDREEL_WRITER: 'gemini', ANTHROPIC_API_KEY: 'x' }, true)).toBe('gemini');
    expect(detectBackend({ ANTHROPIC_API_KEY: 'x', GEMINI_API_KEY: 'y' }, true)).toBe('anthropic');
    expect(detectBackend({ GEMINI_API_KEY: 'y' }, true)).toBe('gemini');
    expect(detectBackend({ GOOGLE_API_KEY: 'y' }, false)).toBe('gemini');
    expect(detectBackend({}, true)).toBe('claude-code');
    expect(detectBackend({}, false)).toBeNull();
    expect(detectBackend({ BRANDREEL_WRITER: 'nope' }, false)).toBeNull();
    expect(DEFAULT_MODELS.anthropic).toBe('claude-opus-5');
  });
});

describe('flattenMessages', () => {
  it('labels earlier turns and keeps images in order', () => {
    const parts = flattenMessages(messages);
    expect(parts.map(part => part.kind)).toEqual(['text', 'text', 'text', 'text', 'text', 'image', 'text']);
    expect(parts[1]).toEqual({ kind: 'text', text: 'Your previous reply:' });
    expect(parts[3]).toEqual({ kind: 'text', text: 'Reviewer:' });
    expect(promptText(parts)).toContain('[image 1]');
    expect(promptText(parts, n => `<<${n}>>`)).toContain('<<1>>');
  });

  it('strips zod metadata from JSON schema', () => {
    const json = plainJsonSchema(z.toJSONSchema(schema) as Record<string, unknown>);
    expect(json['$schema']).toBeUndefined();
    expect(json['type']).toBe('object');
  });
});

describe('geminiRequest', () => {
  it('builds an Interactions request with JSON output and image blocks', () => {
    const request = geminiRequest('gemini-3.5-flash', 'SYS', messages, schema);
    expect(request.model).toBe('gemini-3.5-flash');
    expect(request.system_instruction).toBe('SYS');
    expect(request.response_format.mime_type).toBe('application/json');
    expect((request.response_format.schema['properties'] as Record<string, unknown>)['answer']).toBeDefined();
    const image = request.input.find(block => block.type === 'image');
    expect(image).toEqual({ type: 'image', data: 'AAAA', mime_type: 'image/jpeg' });
    expect(request.input[0]).toEqual({ type: 'text', text: 'Write it.' });
  });
});

describe('claude-code backend', () => {
  it('reads structured_output, falls back to fenced result text, and validates', () => {
    const good = parseClaudeCodeOutput(JSON.stringify({ subtype: 'success', structured_output: { answer: 'ok' }, usage: { input_tokens: 2, cache_creation_input_tokens: 10, output_tokens: 5 } }), schema);
    expect(good.value).toEqual({ answer: 'ok' });
    expect(good.usage).toEqual({ input: 12, output: 5 });
    const fenced = parseClaudeCodeOutput(JSON.stringify({ result: '```json\n{"answer":"fenced"}\n```' }), schema);
    expect(fenced.value).toEqual({ answer: 'fenced' });
    const wrong = parseClaudeCodeOutput(JSON.stringify({ structured_output: { answer: 42 } }), schema);
    expect(wrong.value).toBeNull();
    expect(() => parseClaudeCodeOutput(JSON.stringify({ is_error: true, result: 'boom' }), schema)).toThrow(/boom/);
    expect(() => parseClaudeCodeOutput('not json', schema)).toThrow(/not JSON/);
  });

  it('passes the schema and system prompt, and only opens Read when there are frames', () => {
    const plain = claudeCodeArgs('SYS', 'PROMPT', { type: 'object' }, undefined, null);
    expect(plain).toEqual(['-p', 'PROMPT', '--output-format', 'json', '--json-schema', '{"type":"object"}', '--system-prompt', 'SYS', '--no-session-persistence', '--tools', '']);
    const withImages = claudeCodeArgs('SYS', 'PROMPT', {}, 'claude-sonnet-5', '/tmp/frames');
    expect(withImages).toContain('--add-dir');
    expect(withImages).toContain('Read');
    expect(withImages.slice(-2)).toEqual(['--model', 'claude-sonnet-5']);
  });
});

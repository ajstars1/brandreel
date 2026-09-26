import type Anthropic from '@anthropic-ai/sdk';

// The writer keeps a small Anthropic-style conversation (draft → validation errors → repaired
// draft, or frames → review). Backends that take a single prompt get it flattened into ordered
// parts, with the earlier turns labelled so the model knows what it wrote and what came back.

export type Part = { kind: 'text'; text: string } | { kind: 'image'; data: string; mediaType: string };

export function flattenMessages(messages: Anthropic.MessageParam[]): Part[] {
  const parts: Part[] = [];
  messages.forEach((message, index) => {
    const label = message.role === 'assistant' ? 'Your previous reply:' : index === 0 ? '' : 'Reviewer:';
    if (label) parts.push({ kind: 'text', text: label });
    if (typeof message.content === 'string') { parts.push({ kind: 'text', text: message.content }); return; }
    for (const block of message.content) {
      if (block.type === 'text') parts.push({ kind: 'text', text: block.text });
      else if (block.type === 'image' && block.source.type === 'base64') parts.push({ kind: 'image', data: block.source.data, mediaType: block.source.media_type });
    }
  });
  return parts;
}

// Joins the text parts into one prompt, leaving numbered placeholders where images sit.
export function promptText(parts: Part[], imageNote = (n: number) => `[image ${n}]`): string {
  let images = 0;
  return parts.map(part => part.kind === 'text' ? part.text : imageNote(++images)).join('\n\n');
}

// JSON Schema for a backend that takes plain JSON Schema (strips zod's metadata key).
export const plainJsonSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
  const { $schema: _meta, ...rest } = schema;
  return rest;
};

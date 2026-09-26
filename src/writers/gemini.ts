import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { Writer } from '../write.js';
import { flattenMessages, plainJsonSchema } from './flatten.js';

// Google Gemini through the Interactions API: GEMINI_API_KEY (or GOOGLE_API_KEY) in the
// environment. Structured output comes from response_format with the draft's JSON Schema.
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash';

type Block = { type: 'text'; text: string } | { type: 'image'; data: string; mime_type: string };

// The request body, kept separate from the transport so it can be tested.
export function geminiRequest<T>(model: string, system: string, messages: Anthropic.MessageParam[], schema: z.ZodType<T>): {
  model: string; system_instruction: string; input: Block[];
  response_format: { type: 'text'; mime_type: 'application/json'; schema: Record<string, unknown> };
} {
  const input: Block[] = flattenMessages(messages).map(part => part.kind === 'text'
    ? { type: 'text', text: part.text }
    : { type: 'image', data: part.data, mime_type: part.mediaType });
  return {
    model,
    system_instruction: system,
    input,
    response_format: { type: 'text', mime_type: 'application/json', schema: plainJsonSchema(z.toJSONSchema(schema) as Record<string, unknown>) }
  };
}

export function geminiWriter(model = GEMINI_DEFAULT_MODEL): Writer {
  const client = new GoogleGenAI({});
  return {
    model,
    async draft(system, messages, schema) {
      const interaction = await client.interactions.create(geminiRequest(model, system, messages, schema));
      const text = interaction.output_text ?? '';
      let value: unknown = null;
      try { value = JSON.parse(text); } catch { value = null; }
      const parsed = value === null ? null : schema.safeParse(value);
      const usage = interaction.usage;
      return {
        value: parsed?.success ? parsed.data : null,
        stopReason: interaction.status === 'completed' ? 'end_turn' : (interaction.status ?? null),
        usage: { input: usage?.total_input_tokens ?? 0, output: usage?.total_output_tokens ?? 0 }
      };
    }
  };
}

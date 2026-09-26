import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Writer } from '../write.js';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5';

// Pay-as-you-go Anthropic API: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
export function anthropicWriter(model = ANTHROPIC_DEFAULT_MODEL): Writer {
  const client = new Anthropic();
  return {
    model,
    async draft(system, messages, schema) {
      const response = await client.messages.parse({
        model,
        max_tokens: 16000,
        system,
        messages,
        output_config: { format: zodOutputFormat(schema) }
      });
      return {
        value: response.parsed_output ?? null,
        stopReason: response.stop_reason,
        usage: { input: response.usage.input_tokens, output: response.usage.output_tokens }
      };
    }
  };
}

export const isAnthropicAuthError = (error: unknown): boolean =>
  error instanceof Anthropic.AuthenticationError
  || (error instanceof Error && !(error instanceof Anthropic.APIError) && /authentication method|API_KEY|api key|credential/i.test(error.message));

export const describeAnthropicError = (error: unknown): string | null => {
  if (error instanceof Anthropic.RateLimitError) return 'Rate limited by the Anthropic API. Try again in a minute.';
  if (error instanceof Anthropic.APIError) return `Anthropic API error ${error.status ?? ''}: ${error.message}`;
  return null;
};

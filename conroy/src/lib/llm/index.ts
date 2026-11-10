import { env } from "../env";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai";
import type { LlmProvider } from "./types";

export type { LlmProvider, LlmMessage, LlmRequest, LlmResponse, LlmToolCall } from "./types";

let override: LlmProvider | null | undefined;

/** For tests: inject a scripted provider (null = force the rules engine). */
export function setLlmProviderForTests(p: LlmProvider | null | undefined) {
  override = p;
}

/** The configured chat model, or null when running the keyword-only rules engine. */
export function getLlmProvider(): LlmProvider | null {
  if (override !== undefined) return override;
  switch (env.LLM_PROVIDER) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set");
      return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL);
    case "openai":
      if (!env.OPENAI_API_KEY) throw new Error("LLM_PROVIDER=openai but OPENAI_API_KEY is not set");
      return new OpenAICompatibleProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.LLM_MODEL);
    default:
      return null;
  }
}

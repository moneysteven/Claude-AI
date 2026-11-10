import type { ToolDefinition } from "../assistant/tools";

/**
 * Provider-neutral chat model interface. Each provider maps this to its own
 * API; the chat engine only talks to `LlmProvider`.
 */

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type LlmMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: LlmToolCall[];
      /** Provider-native content, replayed unchanged within the same turn (e.g. thinking blocks). */
      raw?: unknown;
    }
  | { role: "tool"; results: { toolCallId: string; name: string; content: string; isError?: boolean }[] };

export interface LlmRequest {
  system: { staticPart: string; dynamicPart: string };
  messages: LlmMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens" | "refusal" | "other";
  usage: { inputTokens: number; outputTokens: number };
  raw?: unknown;
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

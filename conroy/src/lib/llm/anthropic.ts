import Anthropic from "@anthropic-ai/sdk";
import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse } from "./types";

/**
 * Claude via the official Anthropic SDK. Default model: claude-haiku-5-5
 * (small and cheap, as requested). The static system prompt is cached.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 45_000 });
  }

  private toMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
    const out: Anthropic.MessageParam[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        out.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        if (Array.isArray(m.raw)) {
          // Same-turn replay: pass content (incl. thinking blocks) back unchanged.
          out.push({ role: "assistant", content: m.raw as Anthropic.ContentBlockParam[] });
        } else {
          const blocks: Anthropic.ContentBlockParam[] = [];
          if (m.content) blocks.push({ type: "text", text: m.content });
          for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
          out.push({ role: "assistant", content: blocks.length ? blocks : m.content || "(no reply)" });
        }
      } else {
        out.push({
          role: "user",
          content: m.results.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.toolCallId,
            content: r.content,
            ...(r.isError ? { is_error: true } : {}),
          })),
        });
      }
    }
    return out;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      system: [
        { type: "text", text: req.system.staticPart, cache_control: { type: "ephemeral" } },
        { type: "text", text: req.system.dynamicPart },
      ],
      // Short, conversational replies: low effort keeps latency and cost down.
      output_config: { effort: "low" },
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
      messages: this.toMessages(req.messages),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));

    const stop = response.stop_reason;
    return {
      text,
      toolCalls,
      stopReason: stop === "tool_use" ? "tool_use" : stop === "end_turn" ? "end" : stop === "max_tokens" ? "max_tokens" : stop === "refusal" ? "refusal" : "other",
      usage: {
        inputTokens:
          (response.usage.input_tokens ?? 0) +
          (response.usage.cache_read_input_tokens ?? 0) +
          (response.usage.cache_creation_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens ?? 0,
      },
      raw: response.content,
    };
  }
}

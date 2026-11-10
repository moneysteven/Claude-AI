import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse } from "./types";

/**
 * Any OpenAI-compatible Chat Completions API (OpenAI, OpenRouter, Groq,
 * DeepSeek, a local server...). Selected with LLM_PROVIDER=openai.
 */

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ChatCompletion {
  choices: {
    finish_reason: string;
    message: { content: string | null; refusal?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAICompatibleProvider implements LlmProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private toMessages(req: LlmRequest): ChatMessage[] {
    const out: ChatMessage[] = [{ role: "system", content: `${req.system.staticPart}\n\n${req.system.dynamicPart}` }];
    for (const m of req.messages as LlmMessage[]) {
      if (m.role === "user") out.push({ role: "user", content: m.content });
      else if (m.role === "assistant")
        out.push({
          role: "assistant",
          content: m.content || null,
          ...(m.toolCalls?.length
            ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) }
            : {}),
        });
      else for (const r of m.results) out.push({ role: "tool", tool_call_id: r.toolCallId, content: r.content });
    }
    return out;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await this.fetchFn(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: this.toMessages(req),
          tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice: "auto",
          max_completion_tokens: req.maxTokens ?? 1024,
        }),
      });
      if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
      const json = (await res.json()) as ChatCompletion;
      const choice = json.choices[0];
      const toolCalls = (choice.message.tool_calls ?? []).map((c) => {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(c.function.arguments || "{}");
        } catch {
          input = {};
        }
        return { id: c.id, name: c.function.name, input };
      });
      return {
        text: (choice.message.content ?? "").trim(),
        toolCalls,
        stopReason: choice.message.refusal
          ? "refusal"
          : choice.finish_reason === "tool_calls"
            ? "tool_use"
            : choice.finish_reason === "stop"
              ? "end"
              : choice.finish_reason === "length"
                ? "max_tokens"
                : "other",
        usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

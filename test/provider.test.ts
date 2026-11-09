import { describe, expect, test } from "bun:test";
import {
  completeSimple,
  Effort,
  streamSimple,
  type AssistantMessageEvent,
  type Context,
  type SimpleStreamOptions,
  type ToolResultMessage,
} from "@oh-my-pi/pi-ai";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import type { ExtensionAPI, ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import registerExaone from "../src/index";
import {
  EXAONE_BASE_URL,
  EXAONE_MODEL_ID,
  EXAONE_PROVIDER_ID,
  exaoneModel,
  exaoneProvider,
} from "../src/provider";

// Keep the production hostname: changing it to localhost silently enables
// OMP's local-backend compatibility defaults and can hide missing provider flags.
const model = buildModel({
  ...exaoneModel,
  provider: EXAONE_PROVIDER_ID,
  api: "openai-completions",
  baseUrl: EXAONE_BASE_URL,
});

const context: Context = {
  systemPrompt: ["필요한 도구를 사용하고 간결하게 답하세요."],
  messages: [{ role: "user", content: "서울 날씨를 확인해 주세요.", timestamp: 1 }],
  tools: [{
    name: "lookup_weather",
    description: "Look up the weather in a city.",
    strict: true,
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
      additionalProperties: false,
    },
  }],
};

const requestOptions: SimpleStreamOptions = {
  apiKey: "exaone-test-key",
  reasoning: Effort.Low,
  maxTokens: 256,
  // No real network requests or retry sleeps are needed for terminal cases.
  maxHttpAttempts: 1,
};

type Reply = (request: Request) => Response | Promise<Response>;

function transport(...replies: Reply[]) {
  const calls: {
    request: Request;
    body: Record<string, unknown>;
  }[] = [];
  const fetch: NonNullable<SimpleStreamOptions["fetch"]> = async (input, init) => {
    const request = new Request(input, init);
    calls.push({ request, body: await request.clone().json() as Record<string, unknown> });
    const reply = replies.shift();
    if (!reply) throw new Error("Unexpected extra HTTP attempt in EXAONE contract test");
    return reply(request);
  };
  return { calls, fetch };
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return {
    id: "exaone-fixture",
    object: "chat.completion.chunk",
    model: EXAONE_MODEL_ID,
    created: 1,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function sse(...events: unknown[]): Response {
  const wire = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("")
    + "data: [DONE]\r\n\r\n";
  const bytes = new TextEncoder().encode(wire);
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close();
        return;
      }
      // Deliberately split inside UTF-8 characters, SSE fields, and JSON tokens.
      controller.enqueue(bytes.subarray(offset, ++offset));
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

function answer() {
  return sse(
    chunk({ role: "assistant" }),
    chunk({ reasoning_content: "도구 결과를 확인했습니다." }),
    chunk({ content: "서울은 맑습니다." }),
    chunk({}, "stop"),
  );
}

function failure(status: number, headers: Record<string, string> = {}) {
  return Response.json(
    { result_code: status, description: `EXAONE fixture failure ${status}` },
    { status, headers },
  );
}

describe("EXAONE through OMP's native OpenAI transport", () => {
  test("streams UTF-8 reasoning and tool arguments, then replays both through the tool round trip", async () => {
    const http = transport(() => sse(
      chunk({ role: "assistant" }),
      chunk({ reasoning_content: "도시를 " }),
      chunk({ reasoning_content: "확인합니다." }),
      chunk({ tool_calls: [{
        index: 0,
        id: "call_weather",
        type: "function",
        function: { name: "lookup_weather", arguments: '{"city":' },
      }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"서울"}' } }] }),
      chunk({}, "tool_calls"),
      {
        id: "exaone-fixture",
        model: EXAONE_MODEL_ID,
        object: "chat.completion.chunk",
        choices: [],
        // This is EXAONE's actual layout, not OpenAI's nested token details.
        // Reasoning tokens are already included in completion_tokens.
        usage: { prompt_tokens: 22, completion_tokens: 234, reasoning_tokens: 216, total_tokens: 256 },
      },
    ), answer);
    const events: AssistantMessageEvent[] = [];
    const stream = streamSimple(model, context, { ...requestOptions, fetch: http.fetch });
    for await (const event of stream) events.push(event);
    const first = await stream.result();

    expect(first.stopReason).toBe("toolUse");
    expect(first.content).toContainEqual(expect.objectContaining({
      type: "thinking",
      thinking: "도시를 확인합니다.",
    }));
    const toolCall = first.content.find((block) => block.type === "toolCall");
    expect(toolCall).toMatchObject({
      id: "call_weather",
      name: "lookup_weather",
      arguments: { city: "서울" },
    });
    if (!toolCall) throw new Error("The completed tool call is missing");
    const completedCalls = events.filter((event) => event.type === "toolcall_end");
    expect(completedCalls).toHaveLength(1);
    expect(completedCalls[0]).toMatchObject({ toolCall: { arguments: { city: "서울" } } });
    expect(events.map((event) => event.type)).toContain("thinking_delta");
    expect(events.map((event) => event.type)).toContain("toolcall_delta");
    expect(events.at(-1)?.type).toBe("done");
    expect(first.usage.input).toBe(22);
    expect(first.usage.output).toBe(234);
    expect(first.usage.totalTokens).toBe(256);

    const result: ToolResultMessage = {
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: "text", text: "맑음" }],
      isError: false,
      timestamp: 2,
    };
    const second = await completeSimple(model, {
      ...context,
      messages: [...context.messages, first, result],
    }, { ...requestOptions, fetch: http.fetch });
    expect(second.stopReason).toBe("stop");
    expect(second.content).toContainEqual(expect.objectContaining({ type: "text", text: "서울은 맑습니다." }));
    expect(http.calls).toHaveLength(2);

    for (const { request, body } of http.calls) {
      expect(request.url).toBe(`${EXAONE_BASE_URL}/chat/completions`);
      expect(request.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe("Bearer exaone-test-key");
      expect(body).toMatchObject({
        model: EXAONE_MODEL_ID,
        max_tokens: 256,
        stream: true,
        stream_options: { include_usage: true },
        reasoning_effort: "low",
        chat_template_kwargs: { preserve_thinking: true },
      });
      expect(body.max_completion_tokens).toBeUndefined();
      expect(body.store).toBeUndefined();
      expect(body.parallel_tool_calls).toBeUndefined();
      const messages = body.messages as { role: string }[];
      expect(messages[0]?.role).toBe("system");
      expect(messages.some((message) => message.role === "developer")).toBe(false);
      const tools = body.tools as { function: { strict?: boolean } }[];
      expect(tools[0]?.function.strict).toBeUndefined();
    }
    const replay = http.calls[1]!.body.messages as Record<string, unknown>[];
    expect(replay).toContainEqual(expect.objectContaining({
      role: "assistant",
      reasoning_content: "도시를 확인합니다.",
      tool_calls: [expect.objectContaining({ id: "call_weather" })],
    }));
    expect(replay).toContainEqual(expect.objectContaining({
      role: "tool", tool_call_id: "call_weather", content: "맑음",
    }));
  });

  test.each([Effort.Low, Effort.Medium, Effort.High, Effort.Max])("sends the documented %s reasoning effort", async (reasoning) => {
    const http = transport(answer);
    const result = await completeSimple(model, context, { ...requestOptions, reasoning, fetch: http.fetch });
    expect(result.stopReason).toBe("stop");
    expect(http.calls[0]!.body.reasoning_effort).toBe(reasoning);
  });

  test("maps reasoning off to low without disabling EXAONE's mandatory thinking", async () => {
    const http = transport(answer);
    const result = await completeSimple(model, context, {
      ...requestOptions, reasoning: Effort.Max, disableReasoning: true, fetch: http.fetch,
    });
    expect(result.stopReason).toBe("stop");
    expect(http.calls[0]!.body.reasoning_effort).toBe("low");
    expect(http.calls[0]!.body.enable_thinking).toBeUndefined();
    expect(http.calls[0]!.body.thinking).toBeUndefined();
    expect(http.calls[0]!.body.chat_template_kwargs).toEqual({ preserve_thinking: true });
  });

  test("uses OMP's safe output cap while retaining EXAONE's full context metadata", async () => {
    const http = transport(answer);
    const result = await completeSimple(model, context, {
      ...requestOptions, maxTokens: undefined, fetch: http.fetch,
    });
    expect(result.stopReason).toBe("stop");
    expect(model.contextWindow).toBe(524_288);
    expect(http.calls[0]!.body.max_tokens).toBe(64_000);
  });

  test.each([400, 401, 422, 429, 500])("preserves HTTP %i and EXAONE's description with a bounded attempt budget", async (status) => {
    const http = transport(() => failure(status));
    const result = await completeSimple(model, context, { ...requestOptions, fetch: http.fetch });
    expect(result.stopReason).toBe("error");
    expect(result.errorStatus).toBe(status);
    expect(result.errorMessage).toContain(`EXAONE fixture failure ${status}`);
    expect(http.calls).toHaveLength(1);
  });

  test("uses OMP's retry path for a rate-limited request without a provider retry loop", async () => {
    const http = transport(() => failure(429, { "retry-after-ms": "1" }), answer);
    const result = await completeSimple(model, context, {
      ...requestOptions, maxHttpAttempts: 2, fetch: http.fetch,
    });
    expect(result.stopReason).toBe("stop");
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1]!.body).toEqual(http.calls[0]!.body);
  });

  test("propagates cancellation and leaves an incomplete tool turn aborted", async () => {
    const abort = new AbortController();
    const http = transport((request) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        const initial = [
          chunk({ role: "assistant" }),
          chunk({ tool_calls: [{
            index: 0,
            id: "call_incomplete",
            type: "function",
            function: { name: "lookup_weather", arguments: '{"city":' },
          }] }),
        ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
        controller.enqueue(new TextEncoder().encode(initial));
        request.signal.addEventListener("abort", () => controller.error(request.signal.reason), { once: true });
      },
    }), { headers: { "content-type": "text/event-stream" } }));
    const stream = streamSimple(model, context, { ...requestOptions, signal: abort.signal, fetch: http.fetch });
    for await (const event of stream) {
      if (event.type === "toolcall_delta") abort.abort();
    }
    const result = await stream.result();
    expect(abort.signal.aborted).toBe(true);
    expect(http.calls[0]!.request.signal.aborted).toBe(true);
    // OMP's agent loop executes tool turns only after a successful toolUse stop.
    expect(result.stopReason).toBe("aborted");
    expect(http.calls).toHaveLength(1);
  });
});

describe("EXAONE registration and native login", () => {
  test("registers an environment-key reference only when the variable is non-empty", () => {
    const original = process.env.EXAONE_API_KEY;
    try {
      for (const value of [undefined, "  \t  ", "exaone-test-key"]) {
        if (value === undefined) delete process.env.EXAONE_API_KEY;
        else process.env.EXAONE_API_KEY = value;

        const registrations: { id: string; config: ProviderConfig }[] = [];
        const api = {
          registerProvider(id: string, config: ProviderConfig) {
            registrations.push({ id, config });
          },
        } satisfies Pick<ExtensionAPI, "registerProvider">;
        registerExaone(api as ExtensionAPI);

        expect(registrations).toHaveLength(1);
        expect(registrations[0]!.id).toBe(EXAONE_PROVIDER_ID);
        const { config } = registrations[0]!;
        if (value?.trim()) expect(config.apiKey).toBe("EXAONE_API_KEY");
        else expect(Object.hasOwn(config, "apiKey")).toBe(false);
      }
    } finally {
      if (original === undefined) delete process.env.EXAONE_API_KEY;
      else process.env.EXAONE_API_KEY = original;
    }
  });

  test("requests masked input and returns a trimmed API key for OMP to store", async () => {
    const prompts: { secret?: boolean }[] = [];
    const key = await exaoneProvider.oauth!.login({
      onAuth() {},
      async onPrompt(prompt) {
        prompts.push(prompt);
        return "  exaone-test-key  ";
      },
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.secret).toBe(true);
    expect(key).toBe("exaone-test-key");
  });

  test("rejects blank input instead of persisting an unusable credential", async () => {
    await expect(exaoneProvider.oauth!.login({
      onAuth() {},
      async onPrompt() { return "  \n  "; },
    })).rejects.toThrow();
  });
});

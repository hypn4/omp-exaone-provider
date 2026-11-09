import {
  Effort,
  streamSimple,
  type AssistantMessage,
  type Context,
  type Tool,
  type ToolCall,
} from "@oh-my-pi/pi-ai";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import {
  EXAONE_BASE_URL,
  EXAONE_MODEL_ID,
  EXAONE_PROVIDER_ID,
  exaoneModel,
} from "../src/provider.ts";

// Explicitly opt in with `bun run test:live`. Bun loads the local .env file.
// Healthy runs make three inference requests; OMP handles bounded HTTP retries.
const apiKey = process.env.EXAONE_API_KEY?.trim();
const requestTimeoutMs = 120_000;
const model = buildModel({
  ...exaoneModel,
  id: EXAONE_MODEL_ID,
  provider: EXAONE_PROVIDER_ID,
  api: "openai-completions",
  baseUrl: EXAONE_BASE_URL,
});

class SmokeFailure extends Error {}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeFailure(message);
}

function redact(message: string): string {
  const withoutKey = apiKey ? message.split(apiKey).join("[REDACTED]") : message;
  return withoutKey.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function textOf(message: AssistantMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function requestFailure(step: string, message: AssistantMessage): SmokeFailure {
  // Provider error bodies may contain request data. Report status and a useful
  // hint instead of logging the raw error, transcript, or reasoning content.
  const hint =
    message.errorStatus === 401
      ? "Check EXAONE_API_KEY and the key's access to this model."
      : message.errorStatus === 429
        ? "Rate limited; wait before running the smoke check again."
        : message.stopReason === "aborted"
          ? "The request was cancelled or exceeded its 120-second deadline."
          : "Check API availability, credentials, and network connectivity.";
  const status = message.errorStatus
    ? `HTTP ${message.errorStatus}`
    : message.stopReason;
  return new SmokeFailure(`${step} failed (${status}). ${hint}`);
}

async function request(step: string, context: Context) {
  check(apiKey, "EXAONE_API_KEY is required for the live smoke check.");
  console.log(`[RUN] ${step}`);
  const stream = streamSimple(model, context, {
    apiKey,
    reasoning: Effort.Low,
    temperature: 1,
    topP: 0.95,
    maxTokens: 8_192,
    maxHttpAttempts: 3,
    onResponse({ status }) {
      if (status === 429) {
        console.log("[INFO] Rate limited; OMP applies retry headers within the attempt budget.");
      }
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  let message: AssistantMessage | undefined;
  let sawThinking = false;
  let sawText = false;
  const completedToolIds = new Set<string>();

  // Consume all deltas without printing them or executing partial tool calls.
  for await (const event of stream) {
    if (event.type === "thinking_delta" && event.delta.trim()) sawThinking = true;
    if (event.type === "text_delta" && event.delta.trim()) sawText = true;
    if (event.type === "toolcall_end") completedToolIds.add(event.toolCall.id);
    if (event.type === "error") throw requestFailure(step, event.error);
    if (event.type === "done") message = event.message;
  }
  check(message, `${step}: the stream ended without a completed response.`);
  check(
    message.stopReason !== "length",
    `${step}: the response exhausted its token budget before completing.`,
  );
  return { message, sawThinking, sawText, completedToolIds };
}

const addTool: Tool = {
  name: "add",
  description:
    "Add two integers and return their sum. This deterministic tool has no side effects.",
  parameters: {
    type: "object",
    properties: {
      a: { type: "integer", description: "The first integer." },
      b: { type: "integer", description: "The second integer." },
    },
    required: ["a", "b"],
    additionalProperties: false,
  },
};

function executeAdd(call: ToolCall, completedToolIds: Set<string>): number {
  check(call.name === addTool.name, "The model requested an unexpected tool.");
  check(
    call.id.length > 0 && completedToolIds.has(call.id),
    "The tool call did not finish streaming; nothing was executed.",
  );
  const args = call.arguments;
  check(
    typeof args === "object" && args !== null && !Array.isArray(args),
    "The tool arguments must be a complete JSON object.",
  );
  check(
    Object.keys(args).length === 2 && "a" in args && "b" in args,
    "The add tool accepts only a and b.",
  );
  const { a, b } = args;
  check(
    typeof a === "number" &&
      typeof b === "number" &&
      Number.isSafeInteger(a) &&
      Number.isSafeInteger(b),
    "The add tool requires two safe integers.",
  );
  check(a === 17 && b === 25, "The tool arguments did not match the requested calculation.");
  return a + b;
}

async function main() {
  check(
    apiKey,
    "Set EXAONE_API_KEY in your environment or a local, ignored .env file, then run bun run test:live. Get a key at https://docs.exaone.ai/en/docs/authentication.",
  );

  const first = await request("1/3: reasoning and text streaming", {
    messages: [
      {
        role: "user",
        content: "What is 8 times 7? Briefly consider the calculation, then reply with only the number.",
        timestamp: Date.now(),
      },
    ],
  });
  check(first.message.stopReason === "stop", "The first response did not finish normally.");
  check(first.sawThinking, "No non-empty reasoning delta was received.");
  check(first.sawText, "No non-empty text delta was received.");
  check(textOf(first.message) === "56", "The first response did not match the expected answer.");
  console.log("[PASS] Reasoning and text streamed successfully; answer: 56.");

  const context: Context = {
    systemPrompt: [
      "This is a tool integration check. Use the add tool exactly once for the requested calculation. After receiving its result, reply with only the resulting number and do not call any more tools.",
    ],
    messages: [
      {
        role: "user",
        content: "Call add with a=17 and b=25. Use its returned sum for your final answer.",
        timestamp: Date.now(),
      },
    ],
    tools: [addTool],
  };
  const toolTurn = await request("2/3: complete tool-call streaming", context);
  check(toolTurn.message.stopReason === "toolUse", "The model did not request a tool call.");
  const calls = toolTurn.message.content.filter((part) => part.type === "toolCall");
  check(calls.length === 1, "Expected exactly one add call; nothing was executed.");
  const call = calls[0];
  check(call, "The completed add call was missing.");
  const sum = executeAdd(call, toolTurn.completedToolIds);
  console.log("[PASS] Completed arguments validated; read-only add returned 42.");

  // Replay the original assistant object, preserving its reasoning metadata.
  context.messages.push(toolTurn.message, {
    role: "toolResult",
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: "text", text: JSON.stringify({ sum }) }],
    isError: false,
    timestamp: Date.now(),
  });
  const final = await request("3/3: tool result and final answer", context);
  check(final.message.stopReason === "stop", "The tool round-trip did not finish normally.");
  check(final.sawText, "The final answer did not stream text.");
  check(textOf(final.message) === "42", "The final answer did not match the tool result.");
  console.log("[PASS] Tool result and assistant history accepted; final answer: 42.");
  console.log("[PASS] All live smoke checks completed.");
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof SmokeFailure
      ? error.message
      : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
        ? "The request was cancelled or exceeded its 120-second deadline."
        : "Unexpected failure. Check installed dependencies and network connectivity; provider response bodies were not logged.";
  console.error(`[FAIL] ${redact(message)}`);
  process.exitCode = 1;
}

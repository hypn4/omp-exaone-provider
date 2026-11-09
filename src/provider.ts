import { Effort } from "@oh-my-pi/pi-ai";
import type { ProviderConfig, ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";

export const EXAONE_PROVIDER_ID = "exaone";
export const EXAONE_BASE_URL = "https://api.exaone.ai/v1";
export const EXAONE_MODEL_ID = "k-exaone_v2.5";

export const exaoneModel = {
  id: EXAONE_MODEL_ID,
  name: "K-EXAONE 2.5",
  reasoning: true,
  thinking: {
    mode: "effort",
    // The agent guide lists all four tiers; medium was live-verified on 2026-11-09.
    efforts: [Effort.Low, Effort.Medium, Effort.High, Effort.Max],
    defaultLevel: Effort.Max,
    requiresEffort: true,
  },
  input: ["text"],
  // The official 2026-11-09 launch announcement says the API is currently free.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 524_288,
  maxTokens: 524_288,
  compat: {
    maxTokensField: "max_tokens",
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsStrictMode: false,
    toolStrictMode: "none",
    supportsUsageInStreaming: true,
    supportsReasoningEffort: true,
    thinkingFormat: "openai",
    reasoningDisableMode: "lowest-effort",
    reasoningContentField: "reasoning_content",
    replayReasoningContent: true,
    extraBody: {
      chat_template_kwargs: { preserve_thinking: true },
    },
  },
} satisfies ProviderModelConfig;

export const exaoneProvider = {
  baseUrl: EXAONE_BASE_URL,
  api: "openai-completions",
  models: [exaoneModel],
  // OMP uses this login hook for API keys as well as OAuth credentials.
  // Returning a string lets the host store and resolve the key itself.
  oauth: {
    name: "EXAONE",
    async login(callbacks) {
      const key = (
        await callbacks.onPrompt({ message: "EXAONE API key", secret: true })
      ).trim();
      if (!key) throw new Error("EXAONE API key must not be empty.");
      return key;
    },
  },
} satisfies ProviderConfig;

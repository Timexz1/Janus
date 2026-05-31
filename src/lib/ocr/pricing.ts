/**
 * OCR provider token pricing + cost estimation (brief: show token usage and
 * THB cost per image). Prices are USD per 1,000,000 tokens and are a config
 * surface — verify against each provider's current pricing page. Pure + tested.
 */
export interface ModelPricing {
  inputPerM: number; // USD per 1M input tokens
  outputPerM: number; // USD per 1M output tokens
}

export interface ModelInfo {
  label: string;
  pricing: ModelPricing;
}

/** Claude models usable for OCR (model IDs are exact — do not add date suffixes). */
export const CLAUDE_MODELS: Record<string, ModelInfo> = {
  "claude-opus-4-8": { label: "Opus 4.8 (แม่นสุด)", pricing: { inputPerM: 5, outputPerM: 25 } },
  "claude-sonnet-4-6": { label: "Sonnet 4.6 (สมดุล)", pricing: { inputPerM: 3, outputPerM: 15 } },
  "claude-haiku-4-5": { label: "Haiku 4.5 (ถูกสุด)", pricing: { inputPerM: 1, outputPerM: 5 } },
};

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

/** Gemini 2.5 Flash (used by the gemini provider) — approx pricing. */
export const GEMINI_PRICING: ModelPricing = { inputPerM: 0.3, outputPerM: 2.5 };

/** Typhoon OCR has a free tier — treat as $0 for the estimate. */
export const TYPHOON_PRICING: ModelPricing = { inputPerM: 0, outputPerM: 0 };

/** Reference USD→THB rate for cost display (configurable). */
export const USD_THB = 36.5;

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): number {
  return (
    (inputTokens / 1_000_000) * pricing.inputPerM +
    (outputTokens / 1_000_000) * pricing.outputPerM
  );
}

export function usdToThb(usd: number, fx: number = USD_THB): number {
  return usd * fx;
}

export function perImageThb(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
  fx: number = USD_THB,
): number {
  return usdToThb(estimateCostUsd(inputTokens, outputTokens, pricing), fx);
}

/** Pricing for a provider+model, for the route/UI to compute cost consistently. */
export function pricingFor(provider: string, model?: string): ModelPricing {
  if (provider === "claude") {
    return (model && CLAUDE_MODELS[model]?.pricing) || CLAUDE_MODELS[DEFAULT_CLAUDE_MODEL].pricing;
  }
  if (provider === "gemini") return GEMINI_PRICING;
  return TYPHOON_PRICING;
}

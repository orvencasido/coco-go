import { Platform } from 'react-native';
import bundledModel from '../../../scripts/bundled-model.json';
import {
  ModelDescriptor,
  InferenceSamplingConfig,
  LlamaRuntimeConfig,
  QuantizationProfile,
  ModelQuantization,
} from '@/types/ai';

/**
 * Curated on-device Small Language Models optimized for mobile devices.
 * Standard model: Qwen2.5-1.5B-Instruct-Q4_K_M (balanced for reasoning & memory)
 * Ultra-light fallback: Qwen2.5-0.5B-Instruct-Q4_K_M (for devices with < 4GB RAM)
 * Power model: Qwen2.5-3B-Instruct-Q4_K_M (for flagship devices with >= 8GB RAM)
 */
export const AVAILABLE_MODELS: Record<string, ModelDescriptor> = {
  'qwen2.5-1.5b-q4': {
    ...bundledModel,
    name: 'Qwen 2.5 1.5B (Standard)',
    parameterSize: '1.5B',
    quantization: 'Q4_K_M',
    tier: 'standard',
    minRamMb: 2048,
    recommendedRamMb: 4096,
    contextWindow: 2048,
    description: 'Recommended default. High reasoning capability, great Taglish comprehension.',
  },
  'qwen2.5-0.5b-q4': {
    id: 'qwen2.5-0.5b-q4',
    name: 'Qwen 2.5 0.5B (Ultra-Light)',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    checksumSha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
    sizeBytes: 491400032, // Exact upstream file size
    parameterSize: '0.5B',
    quantization: 'Q4_K_M',
    tier: 'ultra_light',
    minRamMb: 1024,
    recommendedRamMb: 2048,
    contextWindow: 2048,
    description: 'Ultra-fast, lowest memory footprint for low-end or older Android phones.',
  },
  'qwen2.5-3b-q4': {
    id: 'qwen2.5-3b-q4',
    name: 'Qwen 2.5 3B (Power)',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    checksumSha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
    sizeBytes: 2104932768, // Exact upstream file size
    parameterSize: '3B',
    quantization: 'Q4_K_M',
    tier: 'power',
    minRamMb: 4096,
    recommendedRamMb: 8192,
    contextWindow: 2048,
    description: 'Maximum conversational fluency and transit step precision for flagship phones.',
  },
};

export const DEFAULT_MODEL_ID = 'qwen2.5-1.5b-q4';
export const FALLBACK_MODEL_ID = 'qwen2.5-0.5b-q4';
export const POWER_MODEL_ID = 'qwen2.5-3b-q4';

/**
 * Quantization Profiles and trade-offs for mobile deployments
 */
export const QUANTIZATION_PROFILES: Record<ModelQuantization, QuantizationProfile> = {
  Q4_K_M: {
    type: 'Q4_K_M',
    bitsPerWeight: 4.5,
    description: 'K-quant medium: 4-bit with 6-bit scales for critical layers. Best quality/RAM balance.',
    recommendedFor: 'Mobile devices with >= 3GB RAM. Default target quantization.',
  },
  Q4_0: {
    type: 'Q4_0',
    bitsPerWeight: 4.0,
    description: 'Legacy 4-bit uniform quantization. Lower RAM, slight perplexity penalty.',
    recommendedFor: 'Extreme resource-constrained environments.',
  },
  Q8_0: {
    type: 'Q8_0',
    bitsPerWeight: 8.0,
    description: '8-bit uniform quantization. Near-zero quality loss, requires ~2x memory.',
    recommendedFor: 'Flagship devices or desktop testing.',
  },
  F16: {
    type: 'F16',
    bitsPerWeight: 16.0,
    description: 'Uncompressed 16-bit float weights.',
    recommendedFor: 'Baseline comparison only; not recommended for mobile.',
  },
};

/**
 * Sampling Presets
 */
export const DEFAULT_SAMPLING_CONFIG: InferenceSamplingConfig = {
  temperature: 0.3,
  topP: 0.9,
  topK: 40,
  maxTokens: 512,
  stopWords: ['<|im_end|>', '<|endoftext|>', '<|im_start|>', 'Commuter:', 'User:'],
  penaltyRepeat: 1.1,
};

/**
 * Greedy/low-temp sampling for structured JSON entity extraction
 */
export const INTENT_EXTRACTION_SAMPLING_CONFIG: InferenceSamplingConfig = {
  temperature: 0.05,
  topP: 0.1,
  topK: 1,
  maxTokens: 160,
  stopWords: ['<|im_end|>', '<|endoftext|>', '\n\n'],
  penaltyRepeat: 1.0,
};

/**
 * Disciplined sampling for Taglish route synthesis from verified SQLite data
 */
export const TRANSIT_SYNTHESIS_SAMPLING_CONFIG: InferenceSamplingConfig = {
  temperature: 0.25,
  topP: 0.85,
  topK: 40,
  maxTokens: 600,
  stopWords: ['<|im_end|>', '<|endoftext|>', '<|im_start|>', 'Commuter:'],
  penaltyRepeat: 1.15,
};

/**
 * Fast chat configuration for quick responses
 */
export const FAST_CHAT_SAMPLING_CONFIG: InferenceSamplingConfig = {
  temperature: 0.4,
  topP: 0.9,
  topK: 40,
  maxTokens: 256,
  stopWords: ['<|im_end|>', '<|endoftext|>'],
  penaltyRepeat: 1.1,
};

/**
 * System Prompts for Philippine Transit Assistant
 */
export const INTENT_EXTRACTION_SYSTEM_PROMPT = `You are a Philippine transit entity extractor.
Analyze the commuter's message and extract origin, destination, and preferred transit mode.
Respond ONLY with valid JSON in this exact structure:
{"intent": "find_route"|"fare_inquiry"|"terminal_info"|"general_help"|"unknown", "origin": "string or null", "destination": "string or null", "preferredMode": "bus"|"mrt"|"lrt"|"jeep"|"uv"|"ferry"|null}
Do not include markdown fences, preambles, or additional text.`;

export const TRANSIT_SYNTHESIS_SYSTEM_PROMPT = `You are 'Coco', a helpful Philippine transit guide.
Using ONLY the verified transit options below, explain to the commuter how to travel.
If they ask in Taglish, respond in warm, natural Taglish.
Include bus lines, transfer stops, and practical tips.

Rules:
1. Base your answer strictly on the verified transit data provided. Do not hallucinate fake routes, bus lines, or terminals.
2. If verified data is empty or missing, apologize warmly and clarify that this route is not yet in the offline database.
3. Keep instructions step-by-step and easy to read on a mobile screen.`;

export const TRANSIT_FALLBACK_SYSTEM_PROMPT = `You are 'Coco', a friendly Philippine transit guide.
The requested route was not found in the verified offline transit database.
Politely inform the commuter in warm Taglish that verified step-by-step data is not currently available for this route.
Suggest nearby major transfer hubs such as PITX, Buendia (Gil Puyat), Cubao, Alabang, or Lucena Grand Central Terminal.`;

/**
 * Hardware configuration defaults and dynamic tuning
 */
export const DEFAULT_CONTEXT_WINDOW = 2048; // Caps KV cache memory under 150 MB

export const DEFAULT_RUNTIME_CONFIG: Required<Omit<LlamaRuntimeConfig, 'modelPath' | 'chatTemplate' | 'isModelAsset' | 'allowMockMode'>> = {
  nCtx: DEFAULT_CONTEXT_WINDOW,
  nGpuLayers: Platform.OS === 'ios' ? 99 : 0, // Metal GPU on iOS, CPU/Vulkan on Android
  nThreads: 2,
  nBatch: 512,
  useMmap: true,
  useMlock: false,
  flashAttn: Platform.OS === 'ios',
};

/**
 * Dynamically resolves optimal thread count and hardware flags
 * Formula for threads: Math.max(1, Math.min(4, cores - 2))
 * Caps threads at 4 to prevent thermal throttling on mobile big.LITTLE architectures.
 */
export function resolveOptimalHardwareConfig(
  overrides?: Partial<LlamaRuntimeConfig>,
): Required<Omit<LlamaRuntimeConfig, 'modelPath' | 'chatTemplate' | 'isModelAsset' | 'allowMockMode'>> {
  const hardwareConcurrency =
    (typeof navigator !== 'undefined' && (navigator as any)?.hardwareConcurrency) || 4;

  const dynamicThreads = Math.max(1, Math.min(4, hardwareConcurrency - 2));

  return {
    nCtx: overrides?.nCtx ?? DEFAULT_CONTEXT_WINDOW,
    nGpuLayers:
      overrides?.nGpuLayers !== undefined
        ? overrides.nGpuLayers
        : Platform.OS === 'ios'
        ? 99
        : 0,
    nThreads: overrides?.nThreads ?? dynamicThreads,
    nBatch: overrides?.nBatch ?? 512,
    useMmap: overrides?.useMmap ?? true,
    useMlock: overrides?.useMlock ?? false,
    flashAttn: overrides?.flashAttn ?? (Platform.OS === 'ios'),
  };
}

/**
 * Formats messages into Qwen2.5 ChatML format
 */
export function buildChatMLPrompt(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): string {
  let prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n`;

  for (const msg of history) {
    prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  }

  prompt += `<|im_start|>user\n${userMessage}<|im_end|>\n<|im_start|>assistant\n`;
  return prompt;
}

/**
 * Retrieve model descriptor by ID
 */
export function getModelById(id: string): ModelDescriptor | undefined {
  return AVAILABLE_MODELS[id];
}

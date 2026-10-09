import { ModelDescriptor, InferenceSamplingConfig } from '@/types/ai';

/**
 * Curated on-device Small Language Models optimized for mobile devices.
 * Primary model: Qwen2.5-1.5B-Instruct-Q4_K_M (balanced for reasoning & memory)
 * Ultra-light fallback: Qwen2.5-0.5B-Instruct-Q4_K_M (for devices with < 4GB RAM)
 * Power model: Qwen2.5-3B-Instruct-Q4_K_M (for flagship devices with >= 8GB RAM)
 */
export const AVAILABLE_MODELS: Record<string, ModelDescriptor> = {
  'qwen2.5-1.5b-q4': {
    id: 'qwen2.5-1.5b-q4',
    name: 'Qwen 2.5 1.5B (Standard)',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    checksumSha256: 'placeholder_sha256_qwen1.5b_q4',
    sizeBytes: 986000000, // ~986 MB
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
    checksumSha256: 'placeholder_sha256_qwen0.5b_q4',
    sizeBytes: 390000000, // ~390 MB
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
    checksumSha256: 'placeholder_sha256_qwen3b_q4',
    sizeBytes: 1930000000, // ~1.93 GB
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

export const DEFAULT_SAMPLING_CONFIG: InferenceSamplingConfig = {
  temperature: 0.2, // Low temperature for deterministic factual extraction & synthesis
  topP: 0.9,
  topK: 40,
  maxTokens: 512,
  stopWords: ['<|im_end|>', '<|endoftext|>', 'Commuter: ', 'User: '],
  penaltyRepeat: 1.1,
};

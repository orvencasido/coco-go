/**
 * Local AI & SLM Inference Types for react-native-llama
 */

export type ModelQuantization = 'Q4_K_M' | 'Q4_0' | 'Q8_0' | 'F16';

export type ModelTier = 'ultra_light' | 'standard' | 'power';

export type ModelStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'ready'
  | 'loading'
  | 'active'
  | 'error';

export interface ModelDescriptor {
  id: string;
  name: string;
  filename: string;
  downloadUrl: string;
  checksumSha256: string;
  sizeBytes: number;
  parameterSize: string;
  quantization: ModelQuantization;
  tier: ModelTier;
  minRamMb: number;
  recommendedRamMb: number;
  contextWindow: number;
  description: string;
}

export interface LlamaRuntimeConfig {
  modelPath: string;
  nCtx: number;
  nGpuLayers: number;
  nThreads: number;
  useMmap: boolean;
  useMlock: boolean;
  chatTemplate?: string;
}

export interface InferenceSamplingConfig {
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  stopWords: string[];
  penaltyRepeat?: number;
}

export interface InferenceMetrics {
  tokensGenerated: number;
  generationSpeedTps: number;
  promptTokens: number;
  timeToFirstTokenMs: number;
  totalDurationMs: number;
  peakMemoryMb?: number;
}

export type TokenStreamCallback = (token: string, accumulatedText: string) => void;

export interface IntentExtractionResult {
  intent: 'find_route' | 'fare_inquiry' | 'terminal_info' | 'general_help' | 'unknown';
  origin?: string;
  destination?: string;
  preferredMode?: string;
  rawJson?: string;
  confidence?: number;
}

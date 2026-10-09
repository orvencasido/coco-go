import type { TransitMode } from './transit';

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

export interface QuantizationProfile {
  type: ModelQuantization;
  bitsPerWeight: number;
  description: string;
  recommendedFor: string;
}

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
  isCustom?: boolean;
  localPath?: string;
}

export interface LlamaRuntimeConfig {
  modelPath: string;
  nCtx?: number;
  nGpuLayers?: number;
  nThreads?: number;
  nBatch?: number;
  useMmap?: boolean;
  useMlock?: boolean;
  chatTemplate?: string;
  isModelAsset?: boolean;
  flashAttn?: boolean;
}

export interface InferenceSamplingConfig {
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  stopWords: string[];
  penaltyRepeat?: number;
  penaltyFreq?: number;
  penaltyPresent?: number;
  jsonSchema?: string;
  grammar?: string;
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

export type TransitIntent =
  | 'find_route'
  | 'fare_inquiry'
  | 'terminal_info'
  | 'general_help'
  | 'unknown';

export interface IntentExtractionResult {
  intent: TransitIntent;
  origin?: string;
  destination?: string;
  preferredMode?: TransitMode | string;
  rawJson?: string;
  confidence?: number;
}

export interface LlamaServiceState {
  isLoaded: boolean;
  isGenerating: boolean;
  isMockMode: boolean;
  activeModelPath: string | null;
  gpuAccelerated: boolean;
  threads: number;
  contextSize: number;
  lastError: string | null;
}

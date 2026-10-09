import {
  LlamaRuntimeConfig,
  InferenceSamplingConfig,
  TokenStreamCallback,
  InferenceMetrics,
} from '@/types/ai';

export interface ILlamaService {
  initModel(config: LlamaRuntimeConfig): Promise<boolean>;
  releaseModel(): Promise<void>;
  generateStream(
    prompt: string,
    samplingConfig: InferenceSamplingConfig,
    onToken: TokenStreamCallback,
  ): Promise<InferenceMetrics>;
  stopGeneration(): Promise<void>;
  isModelLoaded(): boolean;
  getActiveModelPath(): string | null;
}

/**
 * LlamaService manages the react-native-llama native JSI runtime lifecycle.
 * Concrete implementation will be wired by 02-native-ai-engineer.
 */
class LlamaServiceImpl implements ILlamaService {
  private isLoaded = false;
  private activeModelPath: string | null = null;
  private abortRequested = false;

  public async initModel(config: LlamaRuntimeConfig): Promise<boolean> {
    // Scaffold stub - to be connected with initLlama from react-native-llama
    this.activeModelPath = config.modelPath;
    this.isLoaded = true;
    return true;
  }

  public async releaseModel(): Promise<void> {
    // Scaffold stub - clean up JSI context to free RAM
    this.isLoaded = false;
    this.activeModelPath = null;
  }

  public async generateStream(
    prompt: string,
    samplingConfig: InferenceSamplingConfig,
    onToken: TokenStreamCallback,
  ): Promise<InferenceMetrics> {
    // Scaffold stub - to be implemented by 02-native-ai-engineer
    this.abortRequested = false;
    const startTime = Date.now();

    // Placeholder completion
    const placeholderResponse =
      "Kumusta! Ako si Coco, ang iyong offline transit guide. Pakilagay ang iyong pinanggalingan at pupuntahan.";
    
    let accumulated = '';
    const words = placeholderResponse.split(' ');

    for (const word of words) {
      if (this.abortRequested) break;
      const token = word + ' ';
      accumulated += token;
      onToken(token, accumulated);
    }

    const duration = Date.now() - startTime;
    return {
      tokensGenerated: words.length,
      generationSpeedTps: (words.length / (duration || 1)) * 1000,
      promptTokens: prompt.length / 4,
      timeToFirstTokenMs: 50,
      totalDurationMs: duration,
    };
  }

  public async stopGeneration(): Promise<void> {
    this.abortRequested = true;
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }

  public getActiveModelPath(): string | null {
    return this.activeModelPath;
  }
}

export const LlamaService = new LlamaServiceImpl();

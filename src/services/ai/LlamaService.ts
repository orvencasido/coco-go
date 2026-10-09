import * as RNFS from 'react-native-fs';
import {
  initLlama,
  releaseAllLlama,
  LlamaContext,
  TokenData,
  CompletionParams,
  NativeCompletionResult,
} from 'llama.rn';
import {
  LlamaRuntimeConfig,
  InferenceSamplingConfig,
  TokenStreamCallback,
  InferenceMetrics,
  LlamaServiceState,
} from '@/types/ai';
import {
  DEFAULT_SAMPLING_CONFIG,
  resolveOptimalHardwareConfig,
} from './modelConfig';

export interface ILlamaService {
  initModel(config: LlamaRuntimeConfig): Promise<boolean>;
  releaseModel(): Promise<void>;
  generateStream(
    prompt: string,
    samplingConfig?: Partial<InferenceSamplingConfig>,
    onToken?: TokenStreamCallback,
  ): Promise<InferenceMetrics>;
  stopGeneration(): Promise<void>;
  clearCache(clearData?: boolean): Promise<void>;
  isModelLoaded(): boolean;
  getActiveModelPath(): string | null;
  getState(): LlamaServiceState;
}

/**
 * LlamaService manages the react-native-llama native JSI runtime lifecycle.
 * Features:
 * - Hardware acceleration configuration (Metal on iOS, dynamic threads)
 * - Safe C++ JSI context deallocation to prevent memory leaks and OOM crashes
 * - Low-overhead streaming completion with accurate token/sec metrics
 * - Graceful fallback mock mode for simulator and development environments
 * - KV Cache reset capability between conversation queries
 */
export class LlamaServiceImpl implements ILlamaService {
  private context: LlamaContext | null = null;
  private isLoaded = false;
  private isGenerating = false;
  private isMockMode = false;
  private activeModelPath: string | null = null;
  private activeRuntimeConfig: LlamaRuntimeConfig | null = null;
  private abortRequested = false;
  private gpuAccelerated = false;
  private lastError: string | null = null;

  /**
   * Initializes the GGUF model in memory.
   * If a previous model context is active, releases it first to prevent OOM.
   */
  public async initModel(config: LlamaRuntimeConfig): Promise<boolean> {
    try {
      // Release any previously loaded context before allocating new memory
      if (this.context || this.isLoaded) {
        await this.releaseModel();
      }

      this.activeModelPath = config.modelPath;
      this.activeRuntimeConfig = config;
      this.lastError = null;

      // Check physical file existence unless marked as bundle asset
      if (!config.isModelAsset) {
        const fileExists = await this.checkFileExists(config.modelPath);
        if (!fileExists) {
          console.warn(
            `[LlamaService] GGUF model file not found at "${config.modelPath}". Entering fallback mock mode.`,
          );
          this.isMockMode = true;
          this.isLoaded = true;
          this.gpuAccelerated = false;
          return true;
        }
      }

      const hwConfig = resolveOptimalHardwareConfig(config);

      // Initialize native llama.cpp context through JSI
      const llamaParams = {
        model: config.modelPath,
        is_model_asset: !!config.isModelAsset,
        n_ctx: hwConfig.nCtx,
        n_gpu_layers: hwConfig.nGpuLayers,
        n_threads: hwConfig.nThreads,
        n_batch: hwConfig.nBatch,
        use_mmap: hwConfig.useMmap,
        use_mlock: hwConfig.useMlock,
        flash_attn_type: hwConfig.flashAttn ? ('auto' as const) : ('off' as const),
        chat_template: config.chatTemplate,
      };

      const ctx = await initLlama(llamaParams);

      this.context = ctx;
      this.isLoaded = true;
      this.isMockMode = false;
      this.gpuAccelerated = ctx.gpu;
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(
        `[LlamaService] Native context initialization failed: ${errorMessage}. Falling back to mock mode.`,
      );
      this.lastError = errorMessage;
      // Fallback mode ensures app remains functional in dev/simulator without native JSI
      this.isMockMode = true;
      this.isLoaded = true;
      this.gpuAccelerated = false;
      return true;
    }
  }

  /**
   * Releases native C++ context to reclaim system RAM and VRAM.
   */
  public async releaseModel(): Promise<void> {
    if (this.isGenerating) {
      await this.stopGeneration();
    }

    if (this.context) {
      try {
        await this.context.release();
      } catch (err) {
        console.warn('[LlamaService] Error releasing native context:', err);
      } finally {
        this.context = null;
      }
    }

    this.isLoaded = false;
    this.isGenerating = false;
    this.isMockMode = false;
    this.activeModelPath = null;
    this.activeRuntimeConfig = null;
    this.abortRequested = false;
    this.gpuAccelerated = false;
    this.lastError = null;
  }

  /**
   * Global context reclamation for app teardown.
   */
  public async releaseAll(): Promise<void> {
    await this.releaseModel();
    try {
      await releaseAllLlama();
    } catch (err) {
      console.warn('[LlamaService] Error in releaseAllLlama:', err);
    }
  }

  /**
   * Clears the KV cache to prevent context leakage across distinct commuter queries.
   */
  public async clearCache(clearData: boolean = false): Promise<void> {
    if (this.context) {
      try {
        await this.context.clearCache(clearData);
      } catch (err) {
        console.warn('[LlamaService] Error clearing KV cache:', err);
      }
    }
  }

  /**
   * Streams token completions from the loaded model with real-time callbacks.
   */
  public async generateStream(
    prompt: string,
    samplingConfig?: Partial<InferenceSamplingConfig>,
    onToken?: TokenStreamCallback,
  ): Promise<InferenceMetrics> {
    if (!this.isLoaded) {
      throw new Error('[LlamaService] No model loaded. Call initModel() first.');
    }

    this.abortRequested = false;
    this.isGenerating = true;
    const startTime = Date.now();

    const resolvedSampling: InferenceSamplingConfig = {
      ...DEFAULT_SAMPLING_CONFIG,
      ...samplingConfig,
    };

    // Use simulated streaming when in mock mode or simulator
    if (this.isMockMode || !this.context) {
      return this.runMockStream(prompt, resolvedSampling, onToken, startTime);
    }

    let accumulatedText = '';
    let tokenCount = 0;
    let timeToFirstTokenMs = 0;
    const hwConfig = resolveOptimalHardwareConfig(this.activeRuntimeConfig || {});

    const completionParams: CompletionParams = {
      prompt,
      n_predict: resolvedSampling.maxTokens,
      temperature: resolvedSampling.temperature,
      top_p: resolvedSampling.topP,
      top_k: resolvedSampling.topK,
      penalty_repeat: resolvedSampling.penaltyRepeat,
      penalty_freq: resolvedSampling.penaltyFreq,
      penalty_present: resolvedSampling.penaltyPresent,
      stop: resolvedSampling.stopWords,
      n_threads: hwConfig.nThreads,
    };

    if (resolvedSampling.jsonSchema) {
      completionParams.json_schema = resolvedSampling.jsonSchema;
    }
    if (resolvedSampling.grammar) {
      completionParams.grammar = resolvedSampling.grammar;
    }

    const tokenHandler = (data: TokenData) => {
      if (this.abortRequested) {
        return;
      }

      if (timeToFirstTokenMs === 0) {
        timeToFirstTokenMs = Date.now() - startTime;
      }

      const token = data.token || '';
      accumulatedText += token;
      tokenCount += 1;

      if (onToken) {
        try {
          onToken(token, accumulatedText);
        } catch (cbErr) {
          console.warn('[LlamaService] onToken callback error:', cbErr);
        }
      }
    };

    try {
      const result: NativeCompletionResult = await this.context.completion(
        completionParams,
        tokenHandler,
      );

      const totalDurationMs = Math.max(1, Date.now() - startTime);
      const tokensGenerated = result.tokens_predicted || tokenCount;
      const tps =
        result.timings?.predicted_per_second ??
        (tokensGenerated / (totalDurationMs / 1000));
      const promptTokens =
        result.timings?.prompt_n ?? Math.ceil(prompt.length / 4);

      return {
        tokensGenerated,
        generationSpeedTps: Math.round(tps * 10) / 10,
        promptTokens,
        timeToFirstTokenMs:
          timeToFirstTokenMs || Math.round(result.timings?.prompt_ms ?? 50),
        totalDurationMs,
      };
    } catch (err) {
      const totalDurationMs = Math.max(1, Date.now() - startTime);
      if (this.abortRequested) {
        return {
          tokensGenerated: tokenCount,
          generationSpeedTps:
            Math.round((tokenCount / (totalDurationMs / 1000)) * 10) / 10,
          promptTokens: Math.ceil(prompt.length / 4),
          timeToFirstTokenMs: timeToFirstTokenMs || totalDurationMs,
          totalDurationMs,
        };
      }
      throw err;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Aborts active token generation.
   */
  public async stopGeneration(): Promise<void> {
    this.abortRequested = true;
    if (this.context && this.isGenerating) {
      try {
        await this.context.stopCompletion();
      } catch (err) {
        console.warn('[LlamaService] Error in stopCompletion:', err);
      }
    }
    this.isGenerating = false;
  }

  public isModelLoaded(): boolean {
    return this.isLoaded;
  }

  public getActiveModelPath(): string | null {
    return this.activeModelPath;
  }

  public getState(): LlamaServiceState {
    const hwConfig = resolveOptimalHardwareConfig(this.activeRuntimeConfig || {});
    return {
      isLoaded: this.isLoaded,
      isGenerating: this.isGenerating,
      isMockMode: this.isMockMode,
      activeModelPath: this.activeModelPath,
      gpuAccelerated: this.gpuAccelerated,
      threads: hwConfig.nThreads,
      contextSize: hwConfig.nCtx,
      lastError: this.lastError,
    };
  }

  /**
   * Simulated streaming completion for development and testing environments.
   */
  private async runMockStream(
    prompt: string,
    _samplingConfig: InferenceSamplingConfig,
    onToken?: TokenStreamCallback,
    startTime: number = Date.now(),
  ): Promise<InferenceMetrics> {
    let mockResponse = '';

    // If intent extraction was requested via prompt
    if (prompt.includes('entity extractor') || prompt.includes('valid JSON')) {
      const lower = prompt.toLowerCase();
      let origin: string | null = null;
      let dest: string | null = null;

      const originMatch = prompt.match(/Origin:\s*([^,\n]+)/i);
      const destMatch = prompt.match(/Destination:\s*([^,\n.]+)/i);
      if (originMatch && destMatch) {
        origin = originMatch[1].trim();
        dest = destMatch[1].trim();
      } else {
        const fromToMatch = prompt.match(/(?:from|mula|galing)\s+([a-zA-Z0-9\s/.-]+?)\s+(?:to|hanggang|papuntang|pa-)\s+([a-zA-Z0-9\s/.-]+)/i);
        const toMatch = prompt.match(/([a-zA-Z0-9\s/.-]+?)\s+to\s+([a-zA-Z0-9\s/.-]+)/i);
        if (fromToMatch) {
          origin = fromToMatch[1].trim();
          dest = fromToMatch[2].trim();
        } else if (toMatch) {
          origin = toMatch[1].trim();
          dest = toMatch[2].trim();
          if (lower.includes('lucena')) {
            origin = 'Lucena Grand Central Terminal';
          }
          if (lower.includes('pitx')) {
            dest = 'PITX';
          }
          if (lower.includes('buendia')) {
            dest = 'Buendia (Gil Puyat)';
          }
          if (lower.includes('cubao')) {
            dest = 'Cubao';
          }
          if (lower.includes('makati') || lower.includes('ayala')) {
            dest = 'SM Makati / Ayala';
          }
          if (lower.includes('batangas')) {
            dest = 'Batangas';
          }
        }
      }

      const intent = (origin && dest) ? 'find_route' : (origin || dest) ? 'clarification' : 'greeting';

      mockResponse = JSON.stringify({
        intent,
        origin,
        destination: dest,
        preferredMode: 'bus',
      });
    } else if (
      prompt.includes('GREETING_SYSTEM_PROMPT') ||
      prompt.includes('cheerful offline Philippine transit assistant') ||
      prompt.toLowerCase().includes('kumusta')
    ) {
      mockResponse =
        'Kumusta! Ako si Coco, ang iyong offline transit guide para sa Southern Luzon at Metro Manila. Saan mo gustong pumunta? Halimbawa: "Lucena to SM Makati" o "PITX to Cubao".';
    } else if (
      prompt.includes('FALLBACK_NOT_FOUND') ||
      prompt.includes('walang nakitang ruta sa offline database') ||
      prompt.includes('not currently covered')
    ) {
      mockResponse =
        'Pasensya na, hindi pa available ang rutang ito sa aming offline database. Sa ngayon, sinasaklaw namin ang mga provincial routes mula Southern Luzon (Lucena, Batangas) patungong Metro Manila (PITX, Buendia, Cubao, Makati/Ayala, MRT-3, LRT-1, at EDSA Carousel). Subukan maghanap papuntang mga pangunahing terminal.';
    } else if (
      prompt.includes('CLARIFICATION_SYSTEM_PROMPT') ||
      prompt.includes('missing necessary route information') ||
      prompt.includes('Ask the user for clarification:')
    ) {
      mockResponse =
        'Saan ka manggagaling o saan ang iyong destinasyon? Halimbawa: "Lucena to SM Makati" o "PITX to Cubao".';
    } else {
      mockResponse =
        'Kumusta! Ako si Coco, ang iyong offline transit guide.\n\n' +
        'Mula Lucena Grand Central Terminal papuntang Metro Manila:\n' +
        '1. Sumakay ng JAC Liner, DLTB, o JAM Liner bus papuntang PITX o Buendia.\n' +
        '2. Pamasahe ay humigit-kumulang ₱270 - ₱320.\n' +
        '3. Bumababa sa terminal para sa connecting MRT-3, EDSA Busway, o LRT-1.\n\n' +
        'Ingat sa biyahe!';
    }

    const tokens = mockResponse.split(/(?<=\s|[\n{}:,"])/);
    let accumulated = '';
    let timeToFirstTokenMs = 0;

    for (let i = 0; i < tokens.length; i++) {
      if (this.abortRequested) {
        break;
      }

      const token = tokens[i];
      if (i === 0) {
        timeToFirstTokenMs = Date.now() - startTime;
      }

      accumulated += token;
      if (onToken) {
        onToken(token, accumulated);
      }

      // Small async delay to simulate token stream
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const totalDurationMs = Math.max(1, Date.now() - startTime);
    const tokensGenerated = tokens.length;
    const tps = tokensGenerated / (totalDurationMs / 1000);

    this.isGenerating = false;

    return {
      tokensGenerated,
      generationSpeedTps: Math.round(tps * 10) / 10,
      promptTokens: Math.ceil(prompt.length / 4),
      timeToFirstTokenMs: timeToFirstTokenMs || 40,
      totalDurationMs,
    };
  }

  private async checkFileExists(path: string): Promise<boolean> {
    try {
      const cleanPath = path.startsWith('file://') ? path.replace('file://', '') : path;
      if (RNFS && typeof RNFS.exists === 'function') {
        return await RNFS.exists(cleanPath);
      }
    } catch {
      // Fallback if RNFS is not available or path is invalid
    }
    return false;
  }
}

export const LlamaService = new LlamaServiceImpl();

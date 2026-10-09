import { LlamaServiceImpl } from '../LlamaService';
import {
  AVAILABLE_MODELS,
  DEFAULT_CONTEXT_WINDOW,
  resolveOptimalHardwareConfig,
  buildChatMLPrompt,
  INTENT_EXTRACTION_SYSTEM_PROMPT,
} from '../modelConfig';

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: jest.fn((dict) => dict.android),
  },
}));

// Mock react-native-fs
jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(false),
  DocumentDirectoryPath: '/mock/documents',
}));

// Mock llama.rn
jest.mock('llama.rn', () => ({
  initLlama: jest.fn().mockResolvedValue({
    id: 1,
    gpu: false,
    completion: jest.fn().mockResolvedValue({
      text: 'Mock response',
      content: 'Mock response',
      tokens_predicted: 10,
      timings: {
        prompt_n: 5,
        prompt_ms: 10,
        prompt_per_second: 500,
        predicted_n: 10,
        predicted_ms: 100,
        predicted_per_second: 100,
      },
    }),
    stopCompletion: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    clearCache: jest.fn().mockResolvedValue(undefined),
  }),
  releaseAllLlama: jest.fn().mockResolvedValue(undefined),
}));

describe('modelConfig', () => {
  it('defines curated models including standard, fallback, and power tiers', () => {
    expect(AVAILABLE_MODELS['qwen2.5-1.5b-q4']).toBeDefined();
    expect(AVAILABLE_MODELS['qwen2.5-0.5b-q4']).toBeDefined();
    expect(AVAILABLE_MODELS['qwen2.5-3b-q4']).toBeDefined();

    expect(AVAILABLE_MODELS['qwen2.5-1.5b-q4'].tier).toBe('standard');
    expect(AVAILABLE_MODELS['qwen2.5-0.5b-q4'].tier).toBe('ultra_light');
    expect(AVAILABLE_MODELS['qwen2.5-3b-q4'].tier).toBe('power');

    expect(AVAILABLE_MODELS['qwen2.5-1.5b-q4'].contextWindow).toBe(2048);
  });

  it('caps default context window at 2048 to prevent memory spikes', () => {
    expect(DEFAULT_CONTEXT_WINDOW).toBe(2048);

    const hwConfig = resolveOptimalHardwareConfig();
    expect(hwConfig.nCtx).toBe(2048);
    expect(hwConfig.nThreads).toBeGreaterThanOrEqual(1);
    expect(hwConfig.nThreads).toBeLessThanOrEqual(4);
  });

  it('formats ChatML prompt with system and user roles', () => {
    const formatted = buildChatMLPrompt(
      INTENT_EXTRACTION_SYSTEM_PROMPT,
      'Paano pumunta mula Lucena papuntang Buendia?',
    );

    expect(formatted).toContain('<|im_start|>system\n' + INTENT_EXTRACTION_SYSTEM_PROMPT + '<|im_end|>');
    expect(formatted).toContain('<|im_start|>user\nPaano pumunta mula Lucena papuntang Buendia?<|im_end|>');
    expect(formatted.endsWith('<|im_start|>assistant\n')).toBe(true);
  });
});

describe('LlamaService Lifecycle & Streaming', () => {
  let service: LlamaServiceImpl;

  beforeEach(() => {
    service = new LlamaServiceImpl();
  });

  afterEach(async () => {
    await service.releaseModel();
  });

  it('starts in an unloaded state', () => {
    expect(service.isModelLoaded()).toBe(false);
    expect(service.getActiveModelPath()).toBeNull();
    const state = service.getState();
    expect(state.isLoaded).toBe(false);
    expect(state.isGenerating).toBe(false);
  });

  it('rejects a missing model instead of activating canned AI responses', async () => {
    await expect(service.initModel({ modelPath: '/missing.gguf' })).rejects.toThrow('Model file not found');
    expect(service.isModelLoaded()).toBe(false);
    expect(service.getState().isMockMode).toBe(false);
  });

  it('reports native initialization failures instead of silently using mock mode', async () => {
    const rnfs = require('react-native-fs');
    const llama = require('llama.rn');
    rnfs.exists.mockResolvedValueOnce(true);
    llama.initLlama.mockRejectedValueOnce(new Error('Not enough memory'));
    await expect(service.initModel({ modelPath: '/real.gguf' })).rejects.toThrow('Not enough memory');
    expect(service.isModelLoaded()).toBe(false);
    expect(service.getState().isMockMode).toBe(false);
  });

  it('initializes in fallback mock mode when model file does not exist on disk', async () => {
    const success = await service.initModel({
      allowMockMode: true, modelPath: '/non/existent/path/qwen.gguf',
      nCtx: 2048,
    });

    expect(success).toBe(true);
    expect(service.isModelLoaded()).toBe(true);
    expect(service.getActiveModelPath()).toBe('/non/existent/path/qwen.gguf');
    expect(service.getState().isMockMode).toBe(true);
  });

  it('streams tokens with callback and returns valid performance metrics', async () => {
    await service.initModel({
      allowMockMode: true, modelPath: '/dummy/model.gguf',
    });

    const receivedTokens: string[] = [];
    let finalAccumulated = '';

    const metrics = await service.generateStream(
      'Lucena to PITX',
      { temperature: 0.2 },
      (token, accumulated) => {
        receivedTokens.push(token);
        finalAccumulated = accumulated;
      },
    );

    expect(receivedTokens.length).toBeGreaterThan(0);
    expect(finalAccumulated.length).toBeGreaterThan(0);
    expect(metrics.tokensGenerated).toBe(receivedTokens.length);
    expect(metrics.generationSpeedTps).toBeGreaterThan(0);
    expect(metrics.timeToFirstTokenMs).toBeGreaterThan(0);
    expect(metrics.totalDurationMs).toBeGreaterThan(0);
  });

  it('simulates intent extraction JSON when prompted in mock mode', async () => {
    await service.initModel({
      allowMockMode: true, modelPath: '/dummy/model.gguf',
    });

    let accumulatedText = '';
    await service.generateStream(
      'You are an entity extractor. Return valid JSON only. Origin: Lucena, Destination: PITX',
      {},
      (_token, accumulated) => {
        accumulatedText = accumulated;
      },
    );

    const parsed = JSON.parse(accumulatedText);
    expect(parsed.intent).toBe('find_route');
    expect(parsed.origin).toContain('Lucena');
    expect(parsed.destination).toBe('PITX');
  });

  it('safely releases context and deallocates memory on releaseModel()', async () => {
    await service.initModel({
      allowMockMode: true, modelPath: '/dummy/model.gguf',
    });
    expect(service.isModelLoaded()).toBe(true);

    await service.releaseModel();
    expect(service.isModelLoaded()).toBe(false);
    expect(service.getActiveModelPath()).toBeNull();
    expect(service.getState().isLoaded).toBe(false);
  });

  it('clears cache without error', async () => {
    await service.initModel({
      allowMockMode: true, modelPath: '/dummy/model.gguf',
    });
    await expect(service.clearCache(true)).resolves.not.toThrow();
  });
});

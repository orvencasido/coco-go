import { Platform } from 'react-native';
import { initializeDefaultModel } from '../DefaultModel';
import { LlamaService } from '../LlamaService';
import { DEFAULT_MODEL_ID, AVAILABLE_MODELS } from '../modelConfig';
import { useAppStore } from '../../storage/useAppStore';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../LlamaService', () => ({
  LlamaService: {
    initModel: jest.fn(),
    isModelLoaded: jest.fn().mockReturnValue(false),
    getState: jest.fn().mockReturnValue({ isMockMode: false }),
  },
}));

describe('Default Qwen startup', () => {
  beforeEach(() => {
    (Platform as { OS: string }).OS = 'web';
    (LlamaService.initModel as jest.Mock).mockReset().mockResolvedValue(true);
    useAppStore.setState({ modelStatus: {}, modelInitializationError: null });
  });

  it('automatically selects and starts Qwen 2.5 1.5B in the browser', async () => {
    expect(await initializeDefaultModel()).toBe(true);
    expect(LlamaService.initModel).toHaveBeenCalledWith({
      modelPath: AVAILABLE_MODELS[DEFAULT_MODEL_ID].downloadUrl,
      isModelAsset: true,
      nCtx: 2048,
    });
    expect(useAppStore.getState().activeModelId).toBe(DEFAULT_MODEL_ID);
    expect(useAppStore.getState().modelStatus[DEFAULT_MODEL_ID]).toBe('active');
  });

  it('deduplicates simultaneous startup calls', async () => {
    let finish!: (loaded: boolean) => void;
    (LlamaService.initModel as jest.Mock).mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const first = initializeDefaultModel();
    const second = initializeDefaultModel();
    expect(first).toBe(second);
    expect(useAppStore.getState().modelStatus[DEFAULT_MODEL_ID]).toBe('loading');
    finish(true);
    await first;
    expect(LlamaService.initModel).toHaveBeenCalledTimes(1);
  });

  it('keeps the model inactive after a startup failure and allows retry', async () => {
    (LlamaService.initModel as jest.Mock).mockRejectedValueOnce(new Error('Network disconnected'));
    expect(await initializeDefaultModel()).toBe(false);
    expect(useAppStore.getState().modelStatus[DEFAULT_MODEL_ID]).toBe('error');
    expect(useAppStore.getState().modelInitializationError).toBe('Network disconnected');
    expect(await initializeDefaultModel()).toBe(true);
    expect(useAppStore.getState().modelInitializationError).toBeNull();
  });
});

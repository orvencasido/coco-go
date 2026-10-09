import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useModelManager } from '../useModelManager';
import { useAppStore } from '@/services/storage/useAppStore';
import { ModelStorage } from '@/services/storage/ModelStorage';
import { LlamaService } from '@/services/ai/LlamaService';
import { ModelDownloader } from '@/services/storage/ModelDownloader';
import { AVAILABLE_MODELS } from '@/services/ai/modelConfig';

function renderHook<T>(hook: () => T) {
  const result: { current: T } = {} as any;
  function TestComponent() {
    result.current = hook();
    return null;
  }
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<TestComponent />);
  });
  return {
    result,
    rerender: () => {
      act(() => {
        renderer.update(<TestComponent />);
      });
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

describe('useModelManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    ModelStorage.clearMockFiles();
    act(() => {
      useAppStore.setState({
        activeModelId: 'qwen2.5-1.5b-q4',
        activeModel: AVAILABLE_MODELS['qwen2.5-1.5b-q4'],
        modelStatus: {
          'qwen2.5-1.5b-q4': 'not_downloaded',
          'qwen2.5-0.5b-q4': 'not_downloaded',
          'qwen2.5-3b-q4': 'not_downloaded',
        },
        downloadProgress: 0,
        downloadStateMap: {},
        customModels: [],
        deviceRamMb: 4096,
        deviceStorageFreeMb: 14200,
      });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('provides available models and default recommendations', () => {
    const { result, unmount } = renderHook(() => useModelManager());

    expect(result.current.availableModelsList.length).toBeGreaterThanOrEqual(3);
    expect(result.current.activeModelId).toBe('qwen2.5-1.5b-q4');
    expect(result.current.deviceInfo.recommendedModelId).toBe('qwen2.5-1.5b-q4');
    expect(result.current.deviceInfo.ramMb).toBe(4096);
    unmount();
  });

  it('adapts recommended model based on device RAM', () => {
    const { result, rerender, unmount } = renderHook(() => useModelManager());

    act(() => {
      useAppStore.setState({ deviceRamMb: 1024 });
    });
    rerender();
    expect(result.current.deviceInfo.recommendedModelId).toBe('qwen2.5-0.5b-q4');

    act(() => {
      useAppStore.setState({ deviceRamMb: 8192 });
    });
    rerender();
    expect(result.current.deviceInfo.recommendedModelId).toBe('qwen2.5-3b-q4');
    unmount();
  });

  it('starts a real downloader with the selected model descriptor', async () => {
    const start = jest.spyOn(ModelDownloader, 'start').mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useModelManager());
    await act(async () => {
      await result.current.startDownload('qwen2.5-1.5b-q4');
    });
    expect(start).toHaveBeenCalledWith(AVAILABLE_MODELS['qwen2.5-1.5b-q4']);
    start.mockRestore();
    unmount();
  });

  it('cancels through the real downloader', async () => {
    const cancel = jest.spyOn(ModelDownloader, 'cancel').mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useModelManager());
    await act(async () => {
      await result.current.cancelDownload('qwen2.5-1.5b-q4');
    });
    expect(cancel).toHaveBeenCalledWith('qwen2.5-1.5b-q4');
    cancel.mockRestore();
    unmount();
  });

  it('selects and activates a model with LlamaService initialization', async () => {
    const spyInitModel = jest.spyOn(LlamaService, 'initModel').mockResolvedValue(true);
    const { result, rerender, unmount } = renderHook(() => useModelManager());

    const targetModel = AVAILABLE_MODELS['qwen2.5-0.5b-q4'];
    ModelStorage.setMockFile(targetModel.filename, targetModel.sizeBytes);
    const spyState = jest.spyOn(LlamaService, 'getState').mockReturnValue({
      ...LlamaService.getState(), isLoaded: true, isMockMode: false,
    });

    await act(async () => {
      const success = await result.current.selectModel(targetModel);
      expect(success).toBe(true);
    });
    rerender();

    expect(result.current.activeModelId).toBe('qwen2.5-0.5b-q4');
    expect(result.current.modelStatus['qwen2.5-0.5b-q4']).toBe('active');
    expect(spyInitModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: expect.stringContaining(targetModel.filename),
      }),
    );

    spyInitModel.mockRestore();
    spyState.mockRestore();
    unmount();
  });

  it('sideloads a custom model and adds it to available models', async () => {
    const sourcePath = '/sdcard/Download/custom-tiny-model.gguf';
    ModelStorage.setMockFile(sourcePath, 300000000, true);

    const { result, rerender, unmount } = renderHook(() => useModelManager());

    await act(async () => {
      const sideloadResult = await result.current.sideloadModel(sourcePath, {
        name: 'My Custom Tiny GGUF',
      });
      expect(sideloadResult.success).toBe(true);
      expect(sideloadResult.model?.name).toBe('My Custom Tiny GGUF');
    });
    rerender();

    expect(
      result.current.availableModelsList.some((m) => m.name === 'My Custom Tiny GGUF'),
    ).toBe(true);
    unmount();
  });

  it('does not activate a model whose file is missing', async () => {
    const initialize = jest.spyOn(LlamaService, 'initModel');
    const { result, unmount } = renderHook(() => useModelManager());
    await act(async () => {
      expect(await result.current.selectModel(AVAILABLE_MODELS['qwen2.5-0.5b-q4'])).toBe(false);
    });
    expect(initialize).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeModelId).toBe('qwen2.5-1.5b-q4');
    expect(useAppStore.getState().modelStatus['qwen2.5-0.5b-q4']).toBe('error');
    initialize.mockRestore();
    unmount();
  });

  it('reports native activation failure and keeps the downloaded file available for retry', async () => {
    const model = AVAILABLE_MODELS['qwen2.5-0.5b-q4'];
    ModelStorage.setMockFile(model.filename, model.sizeBytes);
    const initialize = jest.spyOn(LlamaService, 'initModel').mockRejectedValueOnce(new Error('Native engine failed'));
    const { result, unmount } = renderHook(() => useModelManager());
    await act(async () => {
      expect(await result.current.selectModel(model)).toBe(false);
    });
    expect(useAppStore.getState().modelStatus[model.id]).toBe('error');
    expect(useAppStore.getState().downloadStateMap[model.id].failureStage).toBe('activation');
    expect(useAppStore.getState().activeModelId).toBe('qwen2.5-1.5b-q4');
    expect(await ModelStorage.checkModelExists(model.filename)).toBe(true);
    initialize.mockRestore();
    unmount();
  });

  it('deletes a downloaded model and updates its status', async () => {
    const { result, rerender, unmount } = renderHook(() => useModelManager());

    // Mark as ready
    act(() => {
      useAppStore.setState((state) => ({
        modelStatus: { ...state.modelStatus, 'qwen2.5-0.5b-q4': 'ready' },
      }));
    });
    rerender();

    await act(async () => {
      const deleted = await result.current.deleteModel('qwen2.5-0.5b-q4');
      expect(deleted).toBe(true);
    });
    rerender();

    expect(result.current.modelStatus['qwen2.5-0.5b-q4']).toBe('not_downloaded');
    unmount();
  });
});

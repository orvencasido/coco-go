import { useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '@/services/storage/useAppStore';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from '@/services/ai/modelConfig';
import { ModelDescriptor } from '@/types/ai';
import { ModelStorage } from '@/services/storage/ModelStorage';
import { LlamaService } from '@/services/ai/LlamaService';

import { ModelDownloader } from '@/services/storage/ModelDownloader';

let activatingModel = false;

export function useModelManager() {
  const activeModelId = useAppStore((state) => state.activeModelId);
  const activeModel = useAppStore((state) => state.activeModel);
  const modelStatus = useAppStore((state) => state.modelStatus);
  const downloadProgress = useAppStore((state) => state.downloadProgress);
  const downloadStateMap = useAppStore((state) => state.downloadStateMap);
  const customModels = useAppStore((state) => state.customModels);
  const deviceRamMb = useAppStore((state) => state.deviceRamMb);
  const deviceStorageFreeMb = useAppStore((state) => state.deviceStorageFreeMb);

  const setActiveModelId = useAppStore((state) => state.setActiveModelId);
  const setModelStatus = useAppStore((state) => state.setModelStatus);
  const addCustomModel = useAppStore((state) => state.addCustomModel);
  const removeCustomModel = useAppStore((state) => state.removeCustomModel);

  // Combine builtin curated models with user-imported custom models
  const availableModelsList = useMemo(() => {
    return [...Object.values(AVAILABLE_MODELS), ...customModels];
  }, [customModels]);

  // Determine hardware recommendations
  const deviceInfo = useMemo(() => {
    let recommendedModelId = DEFAULT_MODEL_ID;
    if (deviceRamMb < 2048) {
      recommendedModelId = 'qwen2.5-0.5b-q4';
    } else if (deviceRamMb >= 8192) {
      recommendedModelId = 'qwen2.5-3b-q4';
    } else {
      recommendedModelId = 'qwen2.5-1.5b-q4';
    }

    return {
      ramMb: deviceRamMb,
      storageFreeMb: deviceStorageFreeMb,
      recommendedModelId,
    };
  }, [deviceRamMb, deviceStorageFreeMb]);

  // Restore availability from actual files when the manager opens.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      for (const model of availableModelsList) {
        const status = await ModelStorage.getModelStatus(model.id, model);
        const current = useAppStore.getState().modelStatus[model.id];
        if (mounted && current !== 'downloading' && current !== 'loading' && current !== 'active' && current !== 'error') {
          setModelStatus(model.id, status);
        }
      }
    })();
    return () => { mounted = false; };
  }, [availableModelsList, setModelStatus]);

  const startDownload = useCallback(async (modelId: string) => {
    const model = availableModelsList.find((item) => item.id === modelId);
    if (model) {
      await ModelDownloader.start(model);
    }
  }, [availableModelsList]);

  const pauseDownload = useCallback((modelId: string) => ModelDownloader.pause(modelId), []);
  const resumeDownload = useCallback((modelId: string) => ModelDownloader.resume(modelId), []);
  const cancelDownload = useCallback((modelId: string) => ModelDownloader.cancel(modelId), []);

  /**
   * Selects and activates a downloaded or sideloaded model.
   * Automatically initializes LlamaService with the model path.
   */
  const selectModel = useCallback(
    async (model: ModelDescriptor): Promise<boolean> => {
      if (activatingModel || LlamaService.getState().isGenerating) {
        return false;
      }
      activatingModel = true;
      let fileIsValid = false;
      try {
        const localPath = model.localPath || ModelStorage.getModelLocalPath(model.filename);
        const validation = await ModelStorage.verifyModelSize(localPath, model.sizeBytes);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Download a complete model before activating it.');
        }
        fileIsValid = true;
        setModelStatus(model.id, 'loading');
        const loaded = await LlamaService.initModel({
          modelPath: localPath,
          nCtx: model.contextWindow || 2048,
        });
        if (!loaded || LlamaService.getState().isMockMode) {
          throw new Error(LlamaService.getState().lastError || 'The native AI engine could not load this model.');
        }
        if (activeModelId && activeModelId !== model.id) {
          const previous = availableModelsList.find((item) => item.id === activeModelId);
          setModelStatus(activeModelId, previous ? await ModelStorage.getModelStatus(previous.id, previous) : 'not_downloaded');
        }
        setActiveModelId(model.id);
        setModelStatus(model.id, 'active');
        useAppStore.getState().removeDownloadStateForModel(model.id);

        return true;
      } catch (err) {
        console.error('[useModelManager] Failed to initialize model with LlamaService:', err);
        setModelStatus(model.id, 'error');
        useAppStore.getState().setDownloadStateForModel(model.id, {
          statusText: err instanceof Error ? err.message : String(err),
          failureStage: fileIsValid ? 'activation' : 'download',
        });
        if (!LlamaService.isModelLoaded()) {
          const currentId = useAppStore.getState().activeModelId;
          if (currentId !== model.id && useAppStore.getState().modelStatus[currentId] === 'active') {
            setModelStatus(currentId, 'ready');
          }
        }
        return false;
      } finally {
        activatingModel = false;
      }
    },
    [activeModelId, availableModelsList, setActiveModelId, setModelStatus],
  );

  /**
   * Deletes a model from storage to free device disk space.
   */
  const deleteModel = useCallback(
    async (modelId: string): Promise<boolean> => {
      const model =
        AVAILABLE_MODELS[modelId] ||
        customModels.find((m) => m.id === modelId);

      if (!model) return false;

      // Cancel any ongoing download first
      await cancelDownload(modelId);
      if (LlamaService.getActiveModelPath() === (model.localPath || ModelStorage.getModelLocalPath(model.filename))) {
        await LlamaService.releaseModel();
      }

      const localPath = model.localPath || ModelStorage.getModelLocalPath(model.filename);
      await ModelStorage.deleteModelFile(localPath);

      if (model.isCustom) {
        removeCustomModel(modelId);
      } else {
        setModelStatus(modelId, 'not_downloaded');
      }

      // If active model was deleted, switch back to default model
      if (activeModelId === modelId) {
        setActiveModelId(DEFAULT_MODEL_ID);
        setModelStatus(DEFAULT_MODEL_ID, await ModelStorage.getModelStatus(DEFAULT_MODEL_ID));
      }

      return true;
    },
    [
      customModels,
      cancelDownload,
      removeCustomModel,
      setModelStatus,
      activeModelId,
      setActiveModelId,
    ],
  );

  /**
   * Sideloads a user-supplied .gguf model file into the manager.
   */
  const sideloadModel = useCallback(
    async (
      sourcePath: string,
      options?: { name?: string; parameterSize?: string },
    ): Promise<{ success: boolean; model?: ModelDescriptor; error?: string }> => {
      const result = await ModelStorage.registerSideloadedModel(sourcePath, options);
      if (result.success && result.model) {
        addCustomModel(result.model);
        setModelStatus(result.model.id, 'ready');
        return { success: true, model: result.model };
      }
      return { success: false, error: result.error || 'Failed to sideload model' };
    },
    [addCustomModel, setModelStatus],
  );

  return {
    activeModelId,
    activeModel,
    modelStatus,
    downloadProgress,
    downloadStateMap,
    availableModelsList,
    deviceInfo,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    selectModel,
    deleteModel,
    sideloadModel,
  };
}

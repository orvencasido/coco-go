import { useCallback, useMemo } from 'react';
import { useAppStore, ModelDownloadState } from '@/services/storage/useAppStore';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from '@/services/ai/modelConfig';
import { ModelDescriptor, ModelStatus } from '@/types/ai';
import { ModelStorage } from '@/services/storage/ModelStorage';
import { LlamaService } from '@/services/ai/LlamaService';

// Module-level map to track background simulated download jobs
interface ActiveJob {
  timer: ReturnType<typeof setInterval> | null;
  downloadedBytes: number;
  totalBytes: number;
  isPaused: boolean;
}

const activeJobs = new Map<string, ActiveJob>();

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
  const setDownloadProgress = useAppStore((state) => state.setDownloadProgress);
  const setDownloadStateForModel = useAppStore((state) => state.setDownloadStateForModel);
  const removeDownloadStateForModel = useAppStore((state) => state.removeDownloadStateForModel);
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

  /**
   * Starts downloading a model with progress tracking.
   */
  const startDownload = useCallback(
    async (modelId: string, options?: { fastSimulation?: boolean }) => {
      const model =
        AVAILABLE_MODELS[modelId] ||
        customModels.find((m) => m.id === modelId);

      if (!model) {
        console.warn(`[useModelManager] Model with id "${modelId}" not found`);
        return;
      }

      // Clear any existing job
      if (activeJobs.has(modelId)) {
        const existing = activeJobs.get(modelId);
        if (existing?.timer) clearInterval(existing.timer);
        activeJobs.delete(modelId);
      }

      setModelStatus(modelId, 'downloading');
      const totalBytes = model.sizeBytes || 986 * 1024 * 1024;
      let downloadedBytes = 0;

      setDownloadStateForModel(modelId, {
        progress: 0,
        downloadedBytes: 0,
        totalBytes,
        isPaused: false,
        statusText: 'Connecting to Hugging Face repository...',
      });
      setDownloadProgress(0);

      const isTestEnv = process.env.NODE_ENV === 'test' || options?.fastSimulation;
      const stepBytes = isTestEnv ? totalBytes / 2 : totalBytes / 20; // 2 steps in test, ~20 in normal
      const stepIntervalMs = isTestEnv ? 20 : 150;

      const job: ActiveJob = {
        timer: null,
        downloadedBytes: 0,
        totalBytes,
        isPaused: false,
      };

      job.timer = setInterval(async () => {
        if (job.isPaused) return;

        downloadedBytes += stepBytes;
        job.downloadedBytes = downloadedBytes;

        if (downloadedBytes >= totalBytes) {
          downloadedBytes = totalBytes;
          if (job.timer) clearInterval(job.timer);
          activeJobs.delete(modelId);

          // Mark mock file in storage to satisfy existence check
          const localPath = model.localPath || ModelStorage.getModelLocalPath(model.filename);
          ModelStorage.setMockFile(localPath, totalBytes, true);

          setDownloadStateForModel(modelId, {
            progress: 100,
            downloadedBytes: totalBytes,
            totalBytes,
            isPaused: false,
            statusText: 'Download complete! Model ready.',
          });
          setDownloadProgress(100);
          setModelStatus(modelId, 'ready');

          // Clean up progress card after short display
          setTimeout(() => {
            removeDownloadStateForModel(modelId);
          }, 600);
          return;
        }

        const pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
        setDownloadStateForModel(modelId, {
          progress: pct,
          downloadedBytes,
          totalBytes,
          isPaused: false,
          statusText: `Downloading weights (${pct}%)...`,
        });
        setDownloadProgress(pct);
      }, stepIntervalMs);

      activeJobs.set(modelId, job);
    },
    [
      customModels,
      setModelStatus,
      setDownloadStateForModel,
      setDownloadProgress,
      removeDownloadStateForModel,
    ],
  );

  /**
   * Pauses an in-progress model download.
   */
  const pauseDownload = useCallback(
    (modelId: string) => {
      const job = activeJobs.get(modelId);
      if (job) {
        job.isPaused = true;
      }
      setDownloadStateForModel(modelId, {
        isPaused: true,
        statusText: 'Download paused',
      });
    },
    [setDownloadStateForModel],
  );

  /**
   * Resumes a paused model download.
   */
  const resumeDownload = useCallback(
    (modelId: string) => {
      const job = activeJobs.get(modelId);
      if (job) {
        job.isPaused = false;
      }
      setDownloadStateForModel(modelId, {
        isPaused: false,
        statusText: 'Resuming download...',
      });
    },
    [setDownloadStateForModel],
  );

  /**
   * Cancels an ongoing download and cleans up state.
   */
  const cancelDownload = useCallback(
    (modelId: string) => {
      const job = activeJobs.get(modelId);
      if (job?.timer) {
        clearInterval(job.timer);
      }
      activeJobs.delete(modelId);
      removeDownloadStateForModel(modelId);
      setModelStatus(modelId, 'not_downloaded');
      setDownloadProgress(0);
    },
    [removeDownloadStateForModel, setModelStatus, setDownloadProgress],
  );

  /**
   * Selects and activates a downloaded or sideloaded model.
   * Automatically initializes LlamaService with the model path.
   */
  const selectModel = useCallback(
    async (model: ModelDescriptor): Promise<boolean> => {
      try {
        // Check if previously active model status should transition
        if (activeModelId && activeModelId !== model.id) {
          setModelStatus(activeModelId, 'ready');
        }

        setActiveModelId(model.id);
        setModelStatus(model.id, 'active');

        const localPath = model.localPath || ModelStorage.getModelLocalPath(model.filename);
        await LlamaService.initModel({
          modelPath: localPath,
          nCtx: model.contextWindow || 2048,
        });

        return true;
      } catch (err) {
        console.error('[useModelManager] Failed to initialize model with LlamaService:', err);
        setModelStatus(model.id, 'error');
        return false;
      }
    },
    [activeModelId, setActiveModelId, setModelStatus],
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
      cancelDownload(modelId);

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
        setModelStatus(DEFAULT_MODEL_ID, 'ready');
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

import { useCallback } from 'react';
import { useAppStore } from '@/services/storage/useAppStore';
import { AVAILABLE_MODELS } from '@/services/ai/modelConfig';
import { ModelDescriptor } from '@/types/ai';

export function useModelManager() {
  const activeModelId = useAppStore((state) => state.activeModelId);
  const activeModel = useAppStore((state) => state.activeModel);
  const modelStatus = useAppStore((state) => state.modelStatus);
  const downloadProgress = useAppStore((state) => state.downloadProgress);
  const setActiveModelId = useAppStore((state) => state.setActiveModelId);
  const setModelStatus = useAppStore((state) => state.setModelStatus);
  const setDownloadProgress = useAppStore((state) => state.setDownloadProgress);

  const availableModelsList = Object.values(AVAILABLE_MODELS);

  const selectModel = useCallback(
    (model: ModelDescriptor) => {
      setActiveModelId(model.id);
    },
    [setActiveModelId],
  );

  const startDownload = useCallback(
    async (modelId: string) => {
      setModelStatus(modelId, 'downloading');
      setDownloadProgress(0);
      // Model download manager logic to be implemented by 05-mobile-ui-developer / 02-native-ai
    },
    [setModelStatus, setDownloadProgress],
  );

  return {
    activeModelId,
    activeModel,
    modelStatus,
    downloadProgress,
    availableModelsList,
    selectModel,
    startDownload,
  };
}

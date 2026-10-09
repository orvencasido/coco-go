import { Platform } from 'react-native';
import * as RNFS from 'react-native-fs';
import { LlamaService } from './LlamaService';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from './modelConfig';
import { ModelStorage } from '../storage/ModelStorage';
import { useAppStore } from '../storage/useAppStore';

let initialization: Promise<boolean> | null = null;

/** The fixed model is shipped in the app. Startup never downloads weights. */
export function initializeDefaultModel(): Promise<boolean> {
  if (initialization) {
    return initialization;
  }
  if (LlamaService.isModelLoaded() && !LlamaService.getState().isMockMode) {
    return Promise.resolve(true);
  }
  initialization = loadBundledModel().finally(() => {
    initialization = null;
  });
  return initialization;
}

async function loadBundledModel(): Promise<boolean> {
  const model = AVAILABLE_MODELS[DEFAULT_MODEL_ID];
  const store = useAppStore.getState();
  store.setActiveModelId(DEFAULT_MODEL_ID);
  store.setModelStatus(DEFAULT_MODEL_ID, 'loading');
  useAppStore.setState({ modelInitializationError: null });
  try {
    if (Platform.OS === 'web') {
      const loaded = await LlamaService.initModel({
        modelPath: model.downloadUrl,
        isModelAsset: true,
        nCtx: model.contextWindow,
      });
      if (!loaded || LlamaService.getState().isMockMode) {
        throw new Error('Qwen could not start in this browser. Please try again.');
      }
      store.setModelStatus(DEFAULT_MODEL_ID, 'active');
      return true;
    }

    let modelPath: string;
    if (Platform.OS === 'android') {
      // llama.cpp needs a normal file for mmap; unpack the APK asset once.
      modelPath = ModelStorage.getModelLocalPath(model.filename);
      await RNFS.mkdir(ModelStorage.getModelsDirectory());
      const exists = await RNFS.exists(modelPath);
      const validSize = exists && Number((await RNFS.stat(modelPath)).size) === model.sizeBytes;
      if (!validSize) {
        const disk = await RNFS.getFSInfo();
        if (disk.freeSpace < model.sizeBytes + 64 * 1024 * 1024) {
          throw new Error('Not enough storage to prepare the included AI model. Free at least 1.2 GB and try again.');
        }
        const temporaryPath = `${modelPath}.bundled.part`;
        if (await RNFS.exists(temporaryPath)) {
          await RNFS.unlink(temporaryPath);
        }
        try {
          await RNFS.copyFileAssets(model.filename, temporaryPath);
          await verifyBundledFile(temporaryPath);
          if (await RNFS.exists(modelPath)) {
            await RNFS.unlink(modelPath);
          }
          await RNFS.moveFile(temporaryPath, modelPath);
        } finally {
          if (await RNFS.exists(temporaryPath)) {
            await RNFS.unlink(temporaryPath);
          }
        }
      } else {
        await verifyBundledFile(modelPath);
      }
    } else {
      modelPath = `${RNFS.MainBundlePath}/${model.filename}`;
      await verifyBundledFile(modelPath);
    }

    const loaded = await LlamaService.initModel({
      modelPath,
      nCtx: model.contextWindow,
    });
    if (!loaded || LlamaService.getState().isMockMode) {
      throw new Error('The included Qwen model could not be initialized.');
    }
    store.setModelStatus(DEFAULT_MODEL_ID, 'active');
    return true;
  } catch (error) {
    store.setModelStatus(DEFAULT_MODEL_ID, 'error');
    useAppStore.setState({
      modelInitializationError: error instanceof Error ? error.message : String(error),
      modelInitializationProgress: null,
    });
    return false;
  }
}

async function verifyBundledFile(path: string): Promise<void> {
  const model = AVAILABLE_MODELS[DEFAULT_MODEL_ID];
  if (!(await RNFS.exists(path))) {
    throw new Error('The included AI model is missing from this app build.');
  }
  if (Number((await RNFS.stat(path)).size) !== model.sizeBytes ||
      (await RNFS.hash(path, 'sha256')).toLowerCase() !== model.checksumSha256) {
    throw new Error('The included AI model failed verification. Reinstall the app to restore it.');
  }
}

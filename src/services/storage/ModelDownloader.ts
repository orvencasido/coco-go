import { Platform } from 'react-native';
import * as RNFS from 'react-native-fs';
import { ModelDescriptor } from '@/types/ai';
import { ModelStorage } from './ModelStorage';
import { useAppStore } from './useAppStore';

interface DownloadJob {
  model: ModelDescriptor;
  jobId?: number;
  paused: boolean;
  cancelled: boolean;
  verifying: boolean;
  interrupt?: () => void;
  settled: Promise<void>;
}

const jobs = new Map<string, DownloadJob>();

async function removePartial(path: string): Promise<void> {
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
}

/** Streams weights straight to disk; partial files are never advertised as models. */
export const ModelDownloader = {
  async start(model: ModelDescriptor): Promise<void> {
    const store = useAppStore.getState();
    if (jobs.has(model.id)) {
      return;
    }
    if (store.modelStatus[model.id] === 'active' || store.modelStatus[model.id] === 'loading') {
      return;
    }
    if (Platform.OS === 'web') {
      store.setModelStatus(model.id, 'error');
      store.setDownloadStateForModel(model.id, {
        statusText: 'Model installation requires the Android or iOS app.',
      });
      return;
    }
    const path = ModelStorage.getModelLocalPath(model.filename);
    // Stopped native tasks can settle late. Give every attempt its own file so
    // an old task can never truncate or remove a restarted download.
    const partialPath = `${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.part`;
    const job: DownloadJob = {
      model, paused: false, cancelled: false, verifying: false, settled: Promise.resolve(),
    };
    jobs.set(model.id, job);
    store.setModelStatus(model.id, 'downloading');
    store.setDownloadStateForModel(model.id, {
      progress: 0, downloadedBytes: 0, totalBytes: model.sizeBytes,
      isPaused: false, statusText: 'Connecting to Hugging Face...',
      failureStage: undefined,
    });
    store.setDownloadProgress(0);

    job.settled = (async () => {
      try {
        if (!model.downloadUrl || !/^[a-f0-9]{64}$/i.test(model.checksumSha256)) {
          throw new Error('This model has no verified download information.');
        }
        await RNFS.mkdir(ModelStorage.getModelsDirectory());
        await removePartial(partialPath);
        const disk = await RNFS.getFSInfo();
        if (disk.freeSpace < model.sizeBytes + 64 * 1024 * 1024) {
          throw new Error('Not enough free storage to download this model.');
        }
        if (job.cancelled || job.paused) {
          return;
        }
        const interrupted = new Promise<null>((resolve) => {
          job.interrupt = () => resolve(null);
        });
        const download = RNFS.downloadFile({
          fromUrl: model.downloadUrl,
          toFile: partialPath,
          progressInterval: 250,
          connectionTimeout: 30000,
          readTimeout: 120000,
          begin: (response) => {
            if (!job.cancelled && !job.paused) {
              store.setDownloadStateForModel(model.id, {
                totalBytes: response.contentLength || model.sizeBytes,
                statusText: 'Downloading model weights...',
              });
            }
          },
          progress: (response) => {
            if (job.cancelled || job.paused) {
              return;
            }
            const total = response.contentLength || model.sizeBytes;
            const progress = Math.min(99, Math.floor(response.bytesWritten / total * 100));
            store.setDownloadStateForModel(model.id, {
              progress,
              downloadedBytes: response.bytesWritten, totalBytes: total,
            });
            store.setDownloadProgress(progress);
          },
        });
        job.jobId = download.jobId;
        const cleanupStoppedTask = async () => {
          if (job.cancelled || job.paused) {
            await removePartial(partialPath);
          }
        };
        void download.promise.then(cleanupStoppedTask, cleanupStoppedTask).catch((error) => {
          console.warn('[ModelDownloader] Stopped task cleanup failed:', error);
        });
        // iOS stopDownload does not settle the original native download promise.
        const result = await Promise.race([download.promise, interrupted]);
        if (!result || job.cancelled || job.paused) {
          return;
        }
        if (result.statusCode !== 200) {
          throw new Error(`Download failed (HTTP ${result.statusCode}).`);
        }
        job.verifying = true;
        store.setDownloadStateForModel(model.id, {
          statusText: 'Verifying model file...',
        });
        const stat = await RNFS.stat(partialPath);
        if (Number(stat.size) !== model.sizeBytes) {
          throw new Error('Downloaded file is incomplete or has an unexpected size.');
        }
        const checksum = await RNFS.hash(partialPath, 'sha256');
        if (checksum.toLowerCase() !== model.checksumSha256.toLowerCase()) {
          throw new Error('Model checksum verification failed. Please retry the download.');
        }
        if (job.cancelled || job.paused) {
          return;
        }
        await RNFS.moveFile(partialPath, path);
        if (job.cancelled) {
          await removePartial(path);
          return;
        }
        store.setModelStatus(model.id, 'ready');
        store.setDownloadProgress(100);
        store.removeDownloadStateForModel(model.id);
      } catch (error) {
        if (!job.cancelled && !job.paused) {
          store.setModelStatus(model.id, 'error');
          store.setDownloadStateForModel(model.id, {
            statusText: error instanceof Error ? error.message : String(error),
            failureStage: 'download',
          });
        }
      } finally {
        try {
          await removePartial(partialPath);
        } catch (error) {
          console.warn('[ModelDownloader] Partial file cleanup failed:', error);
        }
        if (!job.paused && jobs.get(model.id) === job) {
          jobs.delete(model.id);
        }
      }
    })();
    await job.settled;
  },

  pause(modelId: string): void {
    const job = jobs.get(modelId);
    if (!job || job.cancelled || job.verifying) {
      return;
    }
    job.paused = true;
    if (job.jobId !== undefined) {
      RNFS.stopDownload(job.jobId);
    }
    job.interrupt?.();
    useAppStore.getState().setDownloadStateForModel(modelId, {
      isPaused: true,
      statusText: 'Paused. Continuing restarts the download from the beginning.',
    });
  },

  async resume(modelId: string): Promise<void> {
    const job = jobs.get(modelId);
    if (!job?.paused || job.cancelled) {
      return;
    }
    await job.settled;
    if (jobs.get(modelId) !== job || job.cancelled) {
      return;
    }
    jobs.delete(modelId);
    await this.start(job.model);
  },

  async cancel(modelId: string): Promise<void> {
    const job = jobs.get(modelId);
    if (job) {
      job.cancelled = true;
      job.paused = false;
      if (job.jobId !== undefined) {
        RNFS.stopDownload(job.jobId);
      }
      job.interrupt?.();
      await job.settled;
      if (jobs.get(modelId) === job) {
        jobs.delete(modelId);
      }
    }
    const store = useAppStore.getState();
    store.removeDownloadStateForModel(modelId);
    store.setModelStatus(modelId, 'not_downloaded');
    store.setDownloadProgress(0);
  },
};

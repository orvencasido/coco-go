import * as RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { ModelDownloader } from '../ModelDownloader';
import { useAppStore } from '../useAppStore';
import { AVAILABLE_MODELS } from '../../ai/modelConfig';
import { ModelStorage } from '../ModelStorage';

const model = AVAILABLE_MODELS['qwen2.5-0.5b-q4'];
const nativeDownload = RNFS.downloadFile as jest.Mock;
type DownloadOptions = Parameters<typeof RNFS.downloadFile>[0];

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

function pendingDownload() {
  let resolve!: (result: { statusCode: number; bytesWritten: number }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ statusCode: number; bytesWritten: number }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { jobId: 17, promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe('ModelDownloader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'android';
    useAppStore.setState({ modelStatus: {}, downloadStateMap: {}, downloadProgress: 0 });
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.stat as jest.Mock).mockResolvedValue({ size: model.sizeBytes });
    (RNFS.hash as jest.Mock).mockResolvedValue(model.checksumSha256);
    (RNFS.getFSInfo as jest.Mock).mockResolvedValue({ freeSpace: 10000000000 });
  });

  it('downloads to a partial file, reports real byte progress, verifies and promotes the file', async () => {
    const job = pendingDownload();
    nativeDownload.mockReturnValue(job);
    const completion = ModelDownloader.start(model);
    await flush();
    expect(nativeDownload).toHaveBeenCalledTimes(1);
    const options: DownloadOptions = nativeDownload.mock.calls[0][0];
    expect(options.fromUrl).toBe(model.downloadUrl);
    expect(options.toFile).toMatch(/\.gguf\..+\.part$/);
    options.progress?.({ jobId: 17, contentLength: model.sizeBytes, bytesWritten: 12345 });
    expect(useAppStore.getState().downloadStateMap[model.id].downloadedBytes).toBe(12345);
    expect(useAppStore.getState().modelStatus[model.id]).toBe('downloading');
    job.resolve({ statusCode: 200, bytesWritten: model.sizeBytes });
    await completion;
    expect(RNFS.hash).toHaveBeenCalledWith(options.toFile, 'sha256');
    expect(RNFS.moveFile).toHaveBeenCalledWith(options.toFile, ModelStorage.getModelLocalPath(model.filename));
    expect(useAppStore.getState().modelStatus[model.id]).toBe('ready');
  });

  it.each(['http', 'size', 'checksum', 'network'] as const)('never marks a %s failure ready', async (failure) => {
    nativeDownload.mockReturnValue({
      jobId: 17,
      promise: failure === 'network'
        ? Promise.reject(new Error('Network disconnected'))
        : Promise.resolve({ statusCode: failure === 'http' ? 403 : 200, bytesWritten: model.sizeBytes }),
    });
    if (failure === 'size') {
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: model.sizeBytes - 1 });
    }
    if (failure === 'checksum') {
      (RNFS.hash as jest.Mock).mockResolvedValue('wrong-checksum');
    }
    // Attach the rejection handler before the microtask queue runs.
    await ModelDownloader.start(model);
    expect(useAppStore.getState().modelStatus[model.id]).toBe('error');
    expect(useAppStore.getState().downloadStateMap[model.id].statusText).toBeTruthy();
    expect(RNFS.moveFile).not.toHaveBeenCalled();
  });

  it('cancels the native job, removes the partial file and ignores late progress', async () => {
    const job = pendingDownload();
    nativeDownload.mockReturnValue(job);
    const completion = ModelDownloader.start(model);
    await flush();
    const options: DownloadOptions = nativeDownload.mock.calls[0][0];
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.stopDownload as jest.Mock).mockImplementation(() => job.reject(new Error('cancelled')));
    await ModelDownloader.cancel(model.id);
    await completion;
    options.progress?.({ jobId: 17, contentLength: model.sizeBytes, bytesWritten: 500 });
    expect(RNFS.stopDownload).toHaveBeenCalledWith(17);
    expect(RNFS.unlink).toHaveBeenCalledWith(options.toFile);
    expect(RNFS.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().modelStatus[model.id]).toBe('not_downloaded');
    expect(useAppStore.getState().downloadStateMap[model.id]).toBeUndefined();
  });

  it('pauses the native transfer and restarts it honestly from zero', async () => {
    const job = pendingDownload();
    nativeDownload.mockReturnValue(job);
    const completion = ModelDownloader.start(model);
    await flush();
    (RNFS.stopDownload as jest.Mock).mockImplementation(() => job.reject(new Error('paused')));
    ModelDownloader.pause(model.id);
    await completion;
    expect(useAppStore.getState().downloadStateMap[model.id].isPaused).toBe(true);
    nativeDownload.mockReturnValue({ jobId: 18, promise: Promise.resolve({ statusCode: 200, bytesWritten: model.sizeBytes }) });
    await ModelDownloader.resume(model.id);
    expect(nativeDownload).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().modelStatus[model.id]).toBe('ready');
  });

  it('rejects insufficient disk space before starting a network transfer', async () => {
    (RNFS.getFSInfo as jest.Mock).mockResolvedValue({ freeSpace: 1 });
    await ModelDownloader.start(model);
    expect(nativeDownload).not.toHaveBeenCalled();
    expect(useAppStore.getState().modelStatus[model.id]).toBe('error');
  });

  it('cancels even when iOS leaves the stopped native promise pending', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const job = pendingDownload();
    nativeDownload.mockReturnValue(job);
    (RNFS.stopDownload as jest.Mock).mockImplementation(() => undefined);
    const completion = ModelDownloader.start(model);
    await flush();
    await ModelDownloader.cancel(model.id);
    await completion;
    expect(RNFS.stopDownload).toHaveBeenCalledWith(17);
    expect(useAppStore.getState().modelStatus[model.id]).toBe('not_downloaded');
    expect(RNFS.moveFile).not.toHaveBeenCalled();
  });

  it('does not simulate a browser installation', async () => {
    (Platform as { OS: string }).OS = 'web';
    await ModelDownloader.start(model);
    expect(nativeDownload).not.toHaveBeenCalled();
    expect(useAppStore.getState().modelStatus[model.id]).toBe('error');
  });

  it('prevents duplicate downloads for the same model', async () => {
    const job = pendingDownload();
    nativeDownload.mockReturnValue(job);
    const completion = ModelDownloader.start(model);
    await flush();
    await ModelDownloader.start(model);
    expect(nativeDownload).toHaveBeenCalledTimes(1);
    job.resolve({ statusCode: 200, bytesWritten: model.sizeBytes });
    await completion;
  });
});

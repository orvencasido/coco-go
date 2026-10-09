import type { ModelDescriptor } from '@/types/ai';

export interface ModelTransferProgress {
  loaded: number;
  total: number;
  speedBps: number;
  retrying: boolean;
}

export interface BrowserModelFiles {
  files: Blob[];
  remove: () => Promise<void>;
}

interface CacheOptions {
  chunkBytes?: number;
  concurrency?: number;
  idleTimeoutMs?: number;
  retryDelayMs?: number;
  directory?: FileSystemDirectoryHandle;
}

/** Each committed range is its own file so refresh/retry preserves completed data. */
export async function loadBrowserModelFiles(
  model: ModelDescriptor,
  onProgress: (progress: ModelTransferProgress) => void,
  options: CacheOptions = {},
): Promise<BrowserModelFiles> {
  if (!options.directory && !navigator.storage?.getDirectory) {
    throw new Error('This browser cannot store the AI model. Use a recent Chrome or Edge browser on localhost or HTTPS.');
  }
  const root = options.directory || await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(`coco-qwen-${model.checksumSha256}`, { create: true });
  const chunkBytes = options.chunkBytes || 8 * 1024 * 1024;
  const count = Math.ceil(model.sizeBytes / chunkBytes);
  const blobs: Blob[] = new Array(count);
  const loaded = new Array<number>(count).fill(0);
  const missing: number[] = [];
  const filename = (index: number) => `part-${chunkBytes}-${index}`;
  const size = (index: number) => Math.min(chunkBytes, model.sizeBytes - index * chunkBytes);

  for (let index = 0; index < count; index++) {
    try {
      const file = await (await directory.getFileHandle(filename(index))).getFile();
      if (file.size === size(index)) {
        blobs[index] = file;
        loaded[index] = file.size;
      } else {
        missing.push(index);
      }
    } catch (error) {
      if ((error as DOMException).name !== 'NotFoundError') {
        throw error;
      }
      missing.push(index);
    }
  }

  const initialBytes = loaded.reduce((sum, bytes) => sum + bytes, 0);
  const startTime = Date.now();
  let lastProgressTime = 0;
  const publish = (retrying = false, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressTime < 200) {
      return;
    }
    lastProgressTime = now;
    const bytes = loaded.reduce((sum, value) => sum + value, 0);
    onProgress({
      loaded: bytes,
      total: model.sizeBytes,
      speedBps: Math.max(0, bytes - initialBytes) / Math.max(0.001, (now - startTime) / 1000),
      retrying,
    });
  };
  publish(false, true);

  const pending = new Set<AbortController>();
  let failed = false;
  let cursor = 0;
  const downloadPart = async (index: number) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (failed) {
        return;
      }
      const controller = new AbortController();
      pending.add(controller);
      let timeout: ReturnType<typeof setTimeout>;
      const resetTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => controller.abort(), options.idleTimeoutMs ?? 30000);
      };
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        loaded[index] = 0;
        resetTimeout();
        const from = index * chunkBytes;
        const to = from + size(index) - 1;
        const url = new URL(model.downloadUrl);
        // Separate range requests also avoid intermediary caches reusing a different range.
        url.searchParams.set('coco_range', `${from}-${to}`);
        if (attempt) {
          url.searchParams.set('coco_retry', `${Date.now()}-${attempt}`);
        }
        const response = await fetch(url.toString(), {
          headers: { Range: `bytes=${from}-${to}` },
          signal: controller.signal,
          credentials: 'omit',
        });
        if (response.status !== 206 || !response.body) {
          await response.body?.cancel();
          throw new Error(`AI model transfer failed (HTTP ${response.status}); the server must support byte ranges.`);
        }
        const range = response.headers.get('content-range');
        if (range && range !== `bytes ${from}-${to}/${model.sizeBytes}`) {
          await response.body.cancel();
          throw new Error('The model server returned the wrong data range.');
        }
        reader = response.body.getReader();
        const buffers: Uint8Array[] = [];
        while (true) {
          resetTimeout();
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          loaded[index] += value.length;
          if (loaded[index] > size(index)) {
            throw new Error('The model server returned too much data.');
          }
          buffers.push(value);
          publish();
        }
        if (loaded[index] !== size(index)) {
          throw new Error('The model transfer was interrupted.');
        }
        clearTimeout(timeout!);
        const handle = await directory.getFileHandle(filename(index), { create: true });
        const writable = await handle.createWritable();
        try {
          await writable.write(new Blob(buffers));
          await writable.close();
        } catch (error) {
          await writable.abort().catch(() => {});
          throw error;
        }
        blobs[index] = await handle.getFile();
        publish(false, true);
        return;
      } catch (error) {
        loaded[index] = 0;
        if (failed) {
          return;
        }
        if ((error as DOMException).name === 'QuotaExceededError') {
          throw new Error('Browser storage is full. Free some storage and try again; completed model data is saved.');
        }
        if (attempt === 2) {
          throw new Error(`Model loading stopped after repeated network failures. Completed data is saved; try again to continue. ${error instanceof Error ? error.message : ''}`);
        }
        publish(true, true);
        await new Promise((resolve) => setTimeout(resolve, (options.retryDelayMs ?? 500) * (attempt + 1)));
      } finally {
        clearTimeout(timeout!);
        controller.abort();
        pending.delete(controller);
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
      }
    }
  };

  const workers = Array.from({ length: Math.min(options.concurrency || 4, missing.length) }, async () => {
    try {
      while (!failed && cursor < missing.length) {
        const index = missing[cursor++];
        await downloadPart(index);
      }
    } catch (error) {
      failed = true;
      pending.forEach((controller) => controller.abort());
      throw error;
    }
  });
  const results = await Promise.allSettled(workers);
  const rejection = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejection) {
    throw rejection.reason;
  }
  publish(false, true);
  return {
    files: [new Blob(blobs)],
    remove: async () => {
      await root.removeEntry(`coco-qwen-${model.checksumSha256}`, { recursive: true });
    },
  };
}

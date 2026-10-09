import { Blob as NodeBlob } from 'node:buffer';
import { ReadableStream } from 'node:stream/web';
import { loadBrowserModelFiles } from '../BrowserModelCache';
import type { ModelDescriptor } from '@/types/ai';

const model = {
  sizeBytes: 10, checksumSha256: 'test-checksum', downloadUrl: 'https://example.com/model.gguf',
} as ModelDescriptor;
const source = Buffer.from('abcdefghij');

function storage() {
  const files = new Map<string, NodeBlob>();
  const directory: {
    getDirectoryHandle: jest.Mock;
    removeEntry: jest.Mock;
    getFileHandle: jest.Mock;
  } = {
    getDirectoryHandle: jest.fn(async () => directory),
    removeEntry: jest.fn(async () => { files.clear(); }),
    getFileHandle: jest.fn(async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name) && !options?.create) {
        throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      }
      return {
        getFile: async () => files.get(name),
        createWritable: async () => {
          let value: NodeBlob;
          return {
            write: async (blob: NodeBlob) => { value = blob; },
            close: async () => { files.set(name, value); },
            abort: async () => {},
          };
        },
      };
    }),
  };
  return { files, directory: directory as unknown as FileSystemDirectoryHandle };
}

function responseFor(range: string) {
  const [, from, to] = /bytes=(\d+)-(\d+)/.exec(range)!;
  return {
    status: 206,
    headers: { get: () => `bytes ${from}-${to}/10` },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(source.subarray(Number(from), Number(to) + 1));
        controller.close();
      },
    }),
  };
}

describe('Resumable browser model cache', () => {
  const originalBlob = global.Blob;
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.Blob = NodeBlob as unknown as typeof Blob;
    global.fetch = jest.fn(async (_url, init) => responseFor((init!.headers as Record<string, string>).Range)) as jest.Mock;
  });
  afterEach(() => {
    global.Blob = originalBlob;
    global.fetch = originalFetch;
  });

  it('assembles byte ranges in order and reports actual received bytes', async () => {
    const cache = storage();
    const progress = jest.fn();
    const result = await loadBrowserModelFiles(model, progress, { directory: cache.directory, chunkBytes: 4 });
    expect(await result.files[0].text()).toBe('abcdefghij');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect((global.fetch as jest.Mock).mock.calls.map((call) => call[1].headers.Range)).toEqual(['bytes=0-3', 'bytes=4-7', 'bytes=8-9']);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ loaded: 10, total: 10, retrying: false }));
  });

  it('starts several ranges concurrently rather than one full-model request', async () => {
    let active = 0;
    let maximum = 0;
    global.fetch = jest.fn(async (_url, init) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return responseFor(init.headers.Range);
    }) as jest.Mock;
    await loadBrowserModelFiles(model, jest.fn(), { directory: storage().directory, chunkBytes: 4, concurrency: 2 });
    expect(maximum).toBe(2);
  });

  it('loads a complete cache without any network calls', async () => {
    const cache = storage();
    await loadBrowserModelFiles(model, jest.fn(), { directory: cache.directory, chunkBytes: 4 });
    (global.fetch as jest.Mock).mockClear();
    const result = await loadBrowserModelFiles(model, jest.fn(), { directory: cache.directory, chunkBytes: 4 });
    expect(await result.files[0].text()).toBe('abcdefghij');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('preserves completed ranges and resumes after a failed transfer', async () => {
    const cache = storage();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init.headers.Range === 'bytes=4-7') {
        throw new Error('connection lost');
      }
      return responseFor(init.headers.Range);
    });
    await expect(loadBrowserModelFiles(model, jest.fn(), {
      directory: cache.directory, chunkBytes: 4, concurrency: 1, retryDelayMs: 0,
    })).rejects.toThrow('Completed data is saved');
    expect(cache.files.get('part-4-0')?.size).toBe(4);
    fetchMock.mockClear().mockImplementation(async (_url, init) => responseFor(init.headers.Range));
    const result = await loadBrowserModelFiles(model, jest.fn(), { directory: cache.directory, chunkBytes: 4 });
    expect(await result.files[0].text()).toBe('abcdefghij');
    expect(fetchMock.mock.calls.map((call) => call[1].headers.Range)).toEqual(['bytes=4-7', 'bytes=8-9']);
  });

  it('replaces incomplete cache chunks instead of trusting their existence', async () => {
    const cache = storage();
    cache.files.set('part-4-0', new NodeBlob(['a']));
    const result = await loadBrowserModelFiles(model, jest.fn(), { directory: cache.directory, chunkBytes: 4 });
    expect(await result.files[0].text()).toBe('abcdefghij');
  });

  it('times out stalled streams and retries without committing incomplete data', async () => {
    const cache = storage();
    global.fetch = jest.fn(async (_url, init) => ({
      status: 206, headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          init.signal.addEventListener('abort', () => controller.error(new Error('stalled')));
        },
      }),
    })) as jest.Mock;
    await expect(loadBrowserModelFiles(model, jest.fn(), {
      directory: cache.directory, chunkBytes: 4, concurrency: 1, idleTimeoutMs: 5, retryDelayMs: 0,
    })).rejects.toThrow('repeated network failures');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(cache.files.size).toBe(0);
  });

  it('rejects a mismatched server range rather than caching corrupt model data', async () => {
    const cache = storage();
    global.fetch = jest.fn(async () => ({
      ...responseFor('bytes=0-3'), headers: { get: () => 'bytes 5-8/10' },
    })) as jest.Mock;
    await expect(loadBrowserModelFiles(model, jest.fn(), {
      directory: cache.directory, chunkBytes: 4, concurrency: 1, retryDelayMs: 0,
    })).rejects.toThrow('wrong data range');
    expect(cache.files.size).toBe(0);
  });
});

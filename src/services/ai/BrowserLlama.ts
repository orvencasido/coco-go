import { Wllama } from '@wllama/wllama/esm/index.js';
import { sha256 } from '@noble/hashes/sha256';
import wasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';
import type { CompletionParams, TokenData } from 'llama.rn';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from './modelConfig';
import { useAppStore } from '../storage/useAppStore';
import { loadBrowserModelFiles } from './BrowserModelCache';

const contexts = new Set<{ release: () => Promise<void> }>();

/** Browser implementation of the llama.rn calls used by LlamaService. */
export async function initLlama(params: { n_ctx?: number; n_threads?: number }) {
  const model = AVAILABLE_MODELS[DEFAULT_MODEL_ID];
  const engine = new Wllama({ default: wasmUrl }, {
    allowOffline: true,
    suppressNativeLog: true,
    logger: { debug: () => {}, log: () => {}, warn: console.warn, error: console.error },
  });
  const setProgress = (text: string, progress?: number) => {
    useAppStore.setState({ modelInitializationMessage: text, modelInitializationProgress: progress ?? null });
  };
  try {
    setProgress('Preparing Qwen 2.5 1.5B. First use loads the AI data; future visits reuse the local cache.');
    // Preserve completed caches from the earlier runtime without its network preflight.
    const previous = (await engine.modelManager.getModels()).find((entry) =>
      entry.url === model.downloadUrl && entry.size === model.sizeBytes,
    );
    const cached = previous ? {
      files: await previous.open(), remove: () => previous.remove(),
    } : await loadBrowserModelFiles(model, ({ loaded, total, speedBps, retrying }) => {
      const progress = Math.min(100, Math.round(loaded / total * 10000) / 100);
      const megabytes = (loaded / 1024 / 1024).toFixed(1);
      const totalMegabytes = (total / 1024 / 1024).toFixed(0);
      const speed = (speedBps / 1024 / 1024).toFixed(2);
      setProgress(
        `${retrying ? 'Connection interrupted; reconnecting' : 'Loading Qwen 2.5 1.5B'}: ${megabytes} / ${totalMegabytes} MB · ${speed} MB/s (${progress}%)`,
        progress,
      );
    });
    const files = cached.files;
    if (files.length !== 1 || files[0].size !== model.sizeBytes) {
      await cached.remove();
      throw new Error('The AI data is incomplete. Please try again.');
    }
    setProgress('Verifying Qwen AI data…');
    // Hash a stream instead of allocating another 1.12 GB ArrayBuffer.
    const hash = sha256.create();
    const reader = files[0].stream().getReader();
    let bytesSinceYield = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        hash.update(value);
        bytesSinceYield += value.length;
        if (bytesSinceYield >= 16 * 1024 * 1024) {
          bytesSinceYield = 0;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } finally {
      reader.releaseLock();
    }
    const digest = Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== model.checksumSha256) {
      await cached.remove();
      throw new Error('The AI data failed verification. Please try again.');
    }
    setProgress('Starting Qwen 2.5 1.5B…');
    await engine.loadModel(files, {
      n_ctx: params.n_ctx || 2048,
      n_threads: params.n_threads || 2,
      n_gpu_layers: 0,
      n_batch: 128,
      n_ubatch: 128,
    });
    setProgress('Qwen 2.5 1.5B is ready.');
  } catch (error) {
    await engine.exit().catch(() => {});
    throw error;
  }

  let abort: AbortController | null = null;
  const context = {
    id: Date.now(),
    gpu: false,
    async completion(params: CompletionParams, onToken?: (data: Pick<TokenData, 'token'>) => void) {
      abort = new AbortController();
      let text = '';
      let tokens = 0;
      let promptTokens = 0;
      const start = performance.now();
      try {
        await engine.createCompletion({
          prompt: params.prompt || '',
          max_tokens: params.n_predict || 512,
          temperature: params.temperature,
          top_p: params.top_p,
          top_k: params.top_k,
          penalty_repeat: params.penalty_repeat,
          penalty_freq: params.penalty_freq,
          penalty_present: params.penalty_present,
          stop: params.stop,
          grammar: params.grammar,
          abortSignal: abort.signal,
          stream: true,
          onData: (chunk) => {
            const token = chunk.choices[0]?.text || '';
            if (token) {
              text += token;
              tokens++;
              onToken?.({ token });
            }
            if (chunk.usage) {
              tokens = chunk.usage.completion_tokens;
              promptTokens = chunk.usage.prompt_tokens;
            }
          },
        });
        return {
          text, content: text, tokens_predicted: tokens,
          timings: {
            prompt_n: promptTokens,
            predicted_per_second: tokens / (Math.max(1, performance.now() - start) / 1000),
          },
        };
      } finally {
        abort = null;
      }
    },
    async stopCompletion() { abort?.abort(); },
    async clearCache() { /* Raw completion supplies the complete prompt per call. */ },
    async release() {
      abort?.abort();
      await engine.exit();
      contexts.delete(context);
    },
  };
  contexts.add(context);
  return context;
}

export async function releaseAllLlama() {
  await Promise.all(Array.from(contexts, (context) => context.release()));
}

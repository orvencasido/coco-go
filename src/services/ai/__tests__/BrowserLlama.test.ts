import { Blob as NodeBlob } from 'node:buffer';
import { initLlama } from '../BrowserLlama';
import { useAppStore } from '../../storage/useAppStore';
import { loadBrowserModelFiles } from '../BrowserModelCache';

const mockRemove = jest.fn();
const mockOpen = jest.fn();
const mockEngine = {
  modelManager: {
    getModels: jest.fn(),
  },
  loadModel: jest.fn(),
  createCompletion: jest.fn(),
  exit: jest.fn(),
};

jest.mock('@wllama/wllama/esm/index.js', () => ({
  Wllama: jest.fn(() => mockEngine),
}));
jest.mock('@wllama/wllama/esm/wasm/wllama.wasm?url', () => '/assets/wllama.wasm', { virtual: true });
jest.mock('../BrowserModelCache', () => ({ loadBrowserModelFiles: jest.fn() }));
jest.mock('../modelConfig', () => ({
  DEFAULT_MODEL_ID: 'fixed',
  AVAILABLE_MODELS: {
    fixed: {
      filename: 'fixed.gguf',
      downloadUrl: 'https://example.com/fixed.gguf',
      sizeBytes: 4,
      checksumSha256: require('node:crypto').createHash('sha256').update('GGUF').digest('hex'),
    },
  },
}));

describe('Browser Qwen runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEngine.exit.mockResolvedValue(undefined);
    mockEngine.loadModel.mockResolvedValue(undefined);
    mockOpen.mockResolvedValue([new NodeBlob(['GGUF'])]);
    mockEngine.modelManager.getModels.mockResolvedValue([]);
    (loadBrowserModelFiles as jest.Mock).mockImplementation(async () => ({
      files: await mockOpen(), remove: mockRemove,
    }));
    useAppStore.setState({ modelInitializationError: null });
  });

  it('prepares the fixed model automatically, verifies its bytes, and initializes real inference', async () => {
    const context = await initLlama({ n_ctx: 2048, n_threads: 2 });
    expect(loadBrowserModelFiles).toHaveBeenCalledWith(
      expect.objectContaining({ downloadUrl: 'https://example.com/fixed.gguf' }),
      expect.any(Function),
    );
    expect(mockEngine.loadModel).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ n_ctx: 2048 }));
    expect(context.gpu).toBe(false);
    await context.release();
  });

  it('reuses a complete older cache without downloading again', async () => {
    mockEngine.modelManager.getModels.mockResolvedValue([{
      url: 'https://example.com/fixed.gguf', size: 4,
      open: mockOpen, remove: mockRemove,
    }]);
    const context = await initLlama({});
    expect(loadBrowserModelFiles).not.toHaveBeenCalled();
    expect(mockEngine.loadModel).toHaveBeenCalled();
    await context.release();
  });

  it('rejects corrupt cache bytes before starting inference', async () => {
    mockOpen.mockResolvedValue([new NodeBlob(['BAD!'])]);
    await expect(initLlama({})).rejects.toThrow('failed verification');
    expect(mockRemove).toHaveBeenCalled();
    expect(mockEngine.loadModel).not.toHaveBeenCalled();
  });

  it('rejects incomplete cache files', async () => {
    mockOpen.mockResolvedValue([new NodeBlob(['GG'])]);
    await expect(initLlama({})).rejects.toThrow('incomplete');
    expect(mockEngine.loadModel).not.toHaveBeenCalled();
  });

  it('streams engine output and sampling options through the existing chat pipeline', async () => {
    mockEngine.createCompletion.mockImplementation(async (options) => {
      options.onData({ choices: [{ text: 'Sumakay ' }] });
      options.onData({ choices: [{ text: 'ng bus.' }], usage: { completion_tokens: 4, prompt_tokens: 12 } });
    });
    const context = await initLlama({});
    const tokens = jest.fn();
    const result = await context.completion({ prompt: 'verified route', n_predict: 32, temperature: 0.2 }, tokens);
    expect(result.text).toBe('Sumakay ng bus.');
    expect(result.tokens_predicted).toBe(4);
    expect(tokens).toHaveBeenCalledWith({ token: 'Sumakay ' });
    expect(mockEngine.createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'verified route', max_tokens: 32, temperature: 0.2, stream: true,
    }));
    await context.release();
  });

  it('surfaces initialization failures instead of producing canned answers', async () => {
    mockEngine.loadModel.mockRejectedValueOnce(new Error('Browser out of memory'));
    await expect(initLlama({})).rejects.toThrow('Browser out of memory');
    expect(mockEngine.exit).toHaveBeenCalled();
  });
});

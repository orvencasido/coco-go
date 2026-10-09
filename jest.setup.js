jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/data/user/0/com.cocogo/files',
  exists: jest.fn().mockResolvedValue(false),
  stat: jest.fn().mockResolvedValue({ size: 0 }),
  unlink: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
  copyFileAssets: jest.fn().mockResolvedValue(undefined),
  MainBundlePath: '/mock/app.bundle',
  moveFile: jest.fn().mockResolvedValue(undefined),
  hash: jest.fn().mockResolvedValue(''),
  getFSInfo: jest.fn().mockResolvedValue({ freeSpace: 10000000000, totalSpace: 20000000000 }),
  downloadFile: jest.fn().mockReturnValue({
    jobId: 1,
    promise: Promise.resolve({ statusCode: 200, bytesWritten: 1000 }),
  }),
  stopDownload: jest.fn(),
}));

jest.mock('llama.rn', () => ({
  initLlama: jest.fn().mockResolvedValue({
    id: 1,
    gpu: false,
    completion: jest.fn().mockResolvedValue({
      text: 'Mock response',
      content: 'Mock response',
      tokens_predicted: 10,
      timings: {
        prompt_n: 5,
        prompt_ms: 10,
        prompt_per_second: 500,
        predicted_n: 10,
        predicted_ms: 100,
        predicted_per_second: 100,
      },
    }),
    stopCompletion: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    clearCache: jest.fn().mockResolvedValue(undefined),
  }),
  releaseAllLlama: jest.fn().mockResolvedValue(undefined),
}));

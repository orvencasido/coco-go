import { ModelStorage } from '../ModelStorage';
import { AVAILABLE_MODELS } from '../../ai/modelConfig';

describe('ModelStorage', () => {
  beforeEach(() => {
    ModelStorage.clearMockFiles();
  });

  afterEach(() => {
    ModelStorage.clearMockFiles();
  });

  describe('Path Resolution', () => {
    it('returns a valid models directory path', () => {
      const dir = ModelStorage.getModelsDirectory();
      expect(dir).toBeTruthy();
      expect(dir).toContain('models');
    });

    it('returns a local path for a given filename', () => {
      const filename = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
      const localPath = ModelStorage.getModelLocalPath(filename);
      expect(localPath).toContain(filename);
      expect(localPath.startsWith(ModelStorage.getModelsDirectory())).toBe(true);
    });
  });

  describe('File Existence and Verification', () => {
    it('reports false when model file does not exist', async () => {
      const exists = await ModelStorage.checkModelExists('non_existent.gguf');
      expect(exists).toBe(false);
    });

    it('reports true when model file exists in mock registry', async () => {
      const filename = 'test-model.gguf';
      ModelStorage.setMockFile(filename, 500000000, true);

      const exists = await ModelStorage.checkModelExists(filename);
      expect(exists).toBe(true);
    });

    it('verifies model file size properly', async () => {
      const filename = 'valid-model.gguf';
      const sizeBytes = 986000000;
      ModelStorage.setMockFile(filename, sizeBytes, true);

      const result = await ModelStorage.verifyModelSize(filename, sizeBytes);
      expect(result.exists).toBe(true);
      expect(result.sizeBytes).toBe(sizeBytes);
      expect(result.isValid).toBe(true);
    });

    it('fails validation when file is missing', async () => {
      const result = await ModelStorage.verifyModelSize('missing.gguf', 500000000);
      expect(result.exists).toBe(false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('fails validation when file size is zero', async () => {
      const filename = 'zero-byte.gguf';
      ModelStorage.setMockFile(filename, 0, true);

      const result = await ModelStorage.verifyModelSize(filename, 500000000);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('fails validation when file size is substantially smaller than expected', async () => {
      const filename = 'corrupted.gguf';
      ModelStorage.setMockFile(filename, 1000000, true); // 1 MB instead of 986 MB

      const result = await ModelStorage.verifyModelSize(filename, 986000000);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not match expected size');
    });
  });

  describe('File Deletion', () => {
    it('deletes model file and removes from registry', async () => {
      const filename = 'to-delete.gguf';
      ModelStorage.setMockFile(filename, 500000000, true);

      expect(await ModelStorage.checkModelExists(filename)).toBe(true);

      const deleted = await ModelStorage.deleteModelFile(filename);
      expect(deleted).toBe(true);
      expect(await ModelStorage.checkModelExists(filename)).toBe(false);
    });
  });

  describe('Sideload Registration', () => {
    it('returns error if source sideload file does not exist', async () => {
      const result = await ModelStorage.registerSideloadedModel('/sdcard/non_existent.gguf');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('successfully registers an existing sideloaded GGUF file', async () => {
      const sourcePath = '/sdcard/Download/custom-qwen-model.gguf';
      ModelStorage.setMockFile(sourcePath, 750000000, true);

      const result = await ModelStorage.registerSideloadedModel(sourcePath, {
        name: 'Custom Qwen Experimental',
        parameterSize: '2.0B',
      });

      expect(result.success).toBe(true);
      expect(result.model).toBeDefined();
      expect(result.model?.name).toBe('Custom Qwen Experimental');
      expect(result.model?.isCustom).toBe(true);
      expect(result.model?.parameterSize).toBe('2.0B');
    });
  });

  describe('Model Status Resolution', () => {
    it('returns not_downloaded when file is not present', async () => {
      const status = await ModelStorage.getModelStatus('qwen2.5-1.5b-q4');
      expect(status).toBe('not_downloaded');
    });

    it('returns ready when file is downloaded and verified', async () => {
      const desc = AVAILABLE_MODELS['qwen2.5-1.5b-q4'];
      ModelStorage.setMockFile(desc.filename, desc.sizeBytes, true);

      const status = await ModelStorage.getModelStatus('qwen2.5-1.5b-q4');
      expect(status).toBe('ready');
    });
  });
});

import * as RNFS from 'react-native-fs';
import { AVAILABLE_MODELS } from '../ai/modelConfig';
import { ModelDescriptor, ModelStatus } from '@/types/ai';

export interface LocalModelInfo {
  descriptor: ModelDescriptor;
  status: ModelStatus;
  localPath: string;
  downloadedBytes: number;
}

export interface ModelValidationResult {
  exists: boolean;
  sizeBytes: number;
  isValid: boolean;
  error?: string;
}

export interface SideloadResult {
  success: boolean;
  model?: ModelDescriptor;
  localPath?: string;
  error?: string;
}

/**
 * ModelStorage handles on-device GGUF storage verification,
 * file paths inside the application sandbox, and sideloaded models.
 * Includes graceful in-memory fallback for test and non-native environments.
 */
export class ModelStorage {
  private static readonly MODEL_DIR_NAME = 'models';
  private static readonly FALLBACK_DOCS_PATH = '/data/user/0/com.cocogo/files';

  // In-memory mock storage for testing & environments without native filesystem bridge
  private static mockFiles: Map<string, { sizeBytes: number; exists: boolean }> = new Map();

  /**
   * Resolves the application directory dedicated to storing GGUF models.
   */
  public static getModelsDirectory(): string {
    const basePath =
      RNFS && RNFS.DocumentDirectoryPath
        ? RNFS.DocumentDirectoryPath
        : this.FALLBACK_DOCS_PATH;
    return `${basePath}/${this.MODEL_DIR_NAME}`;
  }

  /**
   * Returns full local filesystem path for a model filename.
   */
  public static getModelLocalPath(filename: string): string {
    const cleanFilename = filename.split('/').pop() || filename;
    return `${this.getModelsDirectory()}/${cleanFilename}`;
  }

  /**
   * Ensures the models storage directory exists on disk.
   */
  public static async ensureModelsDirectory(): Promise<void> {
    try {
      const dirPath = this.getModelsDirectory();
      const exists = await this.pathExists(dirPath);
      if (!exists && RNFS && typeof RNFS.mkdir === 'function') {
        await RNFS.mkdir(dirPath);
      }
    } catch (err) {
      console.warn('[ModelStorage] Failed to ensure models directory:', err);
    }
  }

  /**
   * Checks whether a model file exists at the specified filename or absolute path.
   */
  public static async checkModelExists(filenameOrPath: string): Promise<boolean> {
    const resolvedPath = filenameOrPath.startsWith('/')
      ? filenameOrPath
      : this.getModelLocalPath(filenameOrPath);

    // Check mock registry first (for unit tests / dev mock)
    if (this.mockFiles.has(resolvedPath)) {
      return !!this.mockFiles.get(resolvedPath)?.exists;
    }
    const cleanName = filenameOrPath.split('/').pop() || filenameOrPath;
    if (this.mockFiles.has(cleanName)) {
      return !!this.mockFiles.get(cleanName)?.exists;
    }

    return await this.pathExists(resolvedPath);
  }

  /**
   * Retrieves the byte size of a stored model file.
   */
  public static async getModelSize(filenameOrPath: string): Promise<number> {
    const resolvedPath = filenameOrPath.startsWith('/')
      ? filenameOrPath
      : this.getModelLocalPath(filenameOrPath);

    if (this.mockFiles.has(resolvedPath)) {
      return this.mockFiles.get(resolvedPath)?.sizeBytes || 0;
    }
    const cleanName = filenameOrPath.split('/').pop() || filenameOrPath;
    if (this.mockFiles.has(cleanName)) {
      return this.mockFiles.get(cleanName)?.sizeBytes || 0;
    }

    try {
      if (RNFS && typeof RNFS.stat === 'function') {
        const fileStat = await RNFS.stat(resolvedPath);
        return Number(fileStat.size) || 0;
      }
    } catch {
      // File does not exist or stat failed
    }
    return 0;
  }

  /**
   * Verifies that the model exists on disk and meets size requirements.
   * Prevents corrupted or partially downloaded files from loading into memory.
   */
  public static async verifyModelSize(
    filenameOrPath: string,
    expectedBytes?: number,
  ): Promise<ModelValidationResult> {
    const exists = await this.checkModelExists(filenameOrPath);
    if (!exists) {
      return {
        exists: false,
        sizeBytes: 0,
        isValid: false,
        error: 'Model file does not exist on disk',
      };
    }

    const sizeBytes = await this.getModelSize(filenameOrPath);
    if (sizeBytes <= 0) {
      return {
        exists: true,
        sizeBytes: 0,
        isValid: false,
        error: 'Model file is empty (0 bytes)',
      };
    }

    if (expectedBytes && expectedBytes > 0) {
      // Allow minor variation (e.g. metadata or rounding difference down to 95%)
      const minExpected = expectedBytes * 0.95;
      if (sizeBytes < minExpected) {
        return {
          exists: true,
          sizeBytes,
          isValid: false,
          error: `Model file size (${sizeBytes} bytes) is smaller than expected (${expectedBytes} bytes)`,
        };
      }
    }

    return {
      exists: true,
      sizeBytes,
      isValid: true,
    };
  }

  /**
   * Deletes a model file to free device storage.
   */
  public static async deleteModelFile(filenameOrPath: string): Promise<boolean> {
    const resolvedPath = filenameOrPath.startsWith('/')
      ? filenameOrPath
      : this.getModelLocalPath(filenameOrPath);

    let deleted = false;

    // Remove from mock registry if present
    if (this.mockFiles.has(resolvedPath)) {
      this.mockFiles.delete(resolvedPath);
      deleted = true;
    }
    const cleanName = filenameOrPath.split('/').pop() || filenameOrPath;
    if (this.mockFiles.has(cleanName)) {
      this.mockFiles.delete(cleanName);
      deleted = true;
    }

    try {
      if (RNFS && typeof RNFS.unlink === 'function') {
        const exists = await this.pathExists(resolvedPath);
        if (exists) {
          await RNFS.unlink(resolvedPath);
          deleted = true;
        }
      }
    } catch (err) {
      console.warn(`[ModelStorage] Failed to delete file at "${resolvedPath}":`, err);
    }

    return deleted;
  }

  /**
   * Registers a user-provided sideloaded GGUF model file.
   */
  public static async registerSideloadedModel(
    sourcePath: string,
    options?: {
      name?: string;
      parameterSize?: string;
      contextWindow?: number;
    },
  ): Promise<SideloadResult> {
    const cleanSourcePath = sourcePath.startsWith('file://')
      ? sourcePath.replace('file://', '')
      : sourcePath;

    const exists = await this.checkModelExists(cleanSourcePath);
    if (!exists) {
      return {
        success: false,
        error: `Source GGUF file not found at: ${cleanSourcePath}`,
      };
    }

    const sizeBytes = await this.getModelSize(cleanSourcePath);
    const filename = cleanSourcePath.split('/').pop() || 'custom-model.gguf';
    const targetPath = this.getModelLocalPath(filename);

    // If source is already in the models folder or is external, copy if different
    if (cleanSourcePath !== targetPath) {
      try {
        await this.ensureModelsDirectory();
        if (RNFS && typeof RNFS.copyFile === 'function') {
          await RNFS.copyFile(cleanSourcePath, targetPath);
        }
        // Mirror in mock files if in mock/test mode
        if (this.mockFiles.has(cleanSourcePath)) {
          this.setMockFile(targetPath, sizeBytes, true);
        }
      } catch (err) {
        console.warn('[ModelStorage] Sideload copy failed, using sourcePath directly:', err);
      }
    }

    const finalPath = (await this.checkModelExists(targetPath)) ? targetPath : cleanSourcePath;
    const finalSize = sizeBytes > 0 ? sizeBytes : await this.getModelSize(finalPath);

    const id = `custom_${Date.now()}`;
    const name = options?.name || filename.replace(/\.gguf$/i, '');

    const descriptor: ModelDescriptor = {
      id,
      name,
      filename,
      downloadUrl: '',
      checksumSha256: 'sideloaded_local_file',
      sizeBytes: finalSize || 1024 * 1024 * 500,
      parameterSize: options?.parameterSize || '1.5B',
      quantization: 'Q4_K_M',
      tier: 'standard',
      minRamMb: 2048,
      recommendedRamMb: 4096,
      contextWindow: options?.contextWindow || 2048,
      description: `Sideloaded custom GGUF model: ${filename}`,
      isCustom: true,
      localPath: finalPath,
    };

    return {
      success: true,
      model: descriptor,
      localPath: finalPath,
    };
  }

  /**
   * Evaluates the current download/ready status for a model by ID.
   */
  public static async getModelStatus(
    modelId: string,
    customDescriptor?: ModelDescriptor,
  ): Promise<ModelStatus> {
    const desc = customDescriptor || AVAILABLE_MODELS[modelId];
    if (!desc) return 'error';

    const pathToCheck = desc.localPath || this.getModelLocalPath(desc.filename);
    const exists = await this.checkModelExists(pathToCheck);

    if (!exists) {
      return 'not_downloaded';
    }

    const validation = await this.verifyModelSize(pathToCheck, desc.sizeBytes);
    return validation.isValid ? 'ready' : 'not_downloaded';
  }

  // --- Mock & Test Support Helpers ---

  public static setMockFile(filenameOrPath: string, sizeBytes: number, exists = true): void {
    const resolvedPath = filenameOrPath.startsWith('/')
      ? filenameOrPath
      : this.getModelLocalPath(filenameOrPath);
    this.mockFiles.set(resolvedPath, { sizeBytes, exists });
    const cleanName = filenameOrPath.split('/').pop() || filenameOrPath;
    this.mockFiles.set(cleanName, { sizeBytes, exists });
  }

  public static clearMockFiles(): void {
    this.mockFiles.clear();
  }

  public static getMockFiles(): Map<string, { sizeBytes: number; exists: boolean }> {
    return new Map(this.mockFiles);
  }

  private static async pathExists(path: string): Promise<boolean> {
    try {
      const cleanPath = path.startsWith('file://') ? path.replace('file://', '') : path;
      if (RNFS && typeof RNFS.exists === 'function') {
        return await RNFS.exists(cleanPath);
      }
    } catch {
      // In dev or test environments where RNFS is not linked
    }
    return false;
  }
}

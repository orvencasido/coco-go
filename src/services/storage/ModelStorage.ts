import { AVAILABLE_MODELS } from '../ai/modelConfig';
import { ModelDescriptor, ModelStatus } from '@/types/ai';

export interface LocalModelInfo {
  descriptor: ModelDescriptor;
  status: ModelStatus;
  localPath: string;
  downloadedBytes: number;
}

/**
 * ModelStorage handles on-device GGUF storage verification,
 * file paths inside the application sandbox, and side-loaded models.
 */
export class ModelStorage {
  private static readonly MODEL_DIR_NAME = 'models';

  public static getModelsDirectory(): string {
    // Scaffold path - will be connected to RNFS.DocumentDirectoryPath
    return `/data/user/0/com.cocogo/files/${this.MODEL_DIR_NAME}`;
  }

  public static getModelLocalPath(filename: string): string {
    return `${this.getModelsDirectory()}/${filename}`;
  }

  public static async getModelStatus(modelId: string): Promise<ModelStatus> {
    const desc = AVAILABLE_MODELS[modelId];
    if (!desc) return 'error';
    // Scaffold stub - will query RNFS.exists
    return 'not_downloaded';
  }
}

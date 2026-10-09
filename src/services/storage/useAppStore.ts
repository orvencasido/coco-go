import { create } from 'zustand';
import { ChatMessage, QuickPrompt } from '@/types/chat';
import { ModelDescriptor, ModelStatus } from '@/types/ai';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from '../ai/modelConfig';

export interface ModelDownloadState {
  progress: number; // 0 to 100
  downloadedBytes: number;
  totalBytes: number;
  isPaused: boolean;
  speedBps?: number;
  statusText?: string;
  failureStage?: 'download' | 'activation';
}

interface AppState {
  modelInitializationError: string | null;
  modelInitializationMessage: string;
  modelInitializationProgress: number | null;
  // AI Model State
  activeModelId: string;
  modelStatus: Record<string, ModelStatus>;
  downloadProgress: number; // 0 to 100 (for backward compatibility)
  downloadStateMap: Record<string, ModelDownloadState>;
  activeModel: ModelDescriptor;
  customModels: ModelDescriptor[];

  // Chat State
  messages: ChatMessage[];
  isGenerating: boolean;
  quickPrompts: QuickPrompt[];

  // App & Device Metrics
  isOfflineMode: boolean;
  memoryUsageMb: number;
  deviceRamMb: number;
  deviceStorageFreeMb: number;

  // Actions
  setActiveModelId: (modelId: string) => void;
  setModelStatus: (modelId: string, status: ModelStatus) => void;
  setDownloadProgress: (progress: number) => void;
  setDownloadStateForModel: (modelId: string, state: Partial<ModelDownloadState>) => void;
  removeDownloadStateForModel: (modelId: string) => void;
  addCustomModel: (model: ModelDescriptor) => void;
  removeCustomModel: (modelId: string) => void;

  addMessage: (message: ChatMessage) => void;
  updateLastMessageContent: (content: string, isStreaming?: boolean) => void;
  updateLastMessage: (updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setMemoryUsageMb: (mb: number) => void;
  setDeviceStorageFreeMb: (mb: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  modelInitializationError: null,
  modelInitializationMessage: 'Preparing Qwen 2.5 1.5B…',
  modelInitializationProgress: null,
  activeModelId: DEFAULT_MODEL_ID,
  modelStatus: {
    'qwen2.5-1.5b-q4': 'not_downloaded',
    'qwen2.5-0.5b-q4': 'not_downloaded',
    'qwen2.5-3b-q4': 'not_downloaded',
  },
  downloadProgress: 0,
  downloadStateMap: {},
  activeModel: AVAILABLE_MODELS[DEFAULT_MODEL_ID],
  customModels: [],

  messages: [
    {
      id: 'welcome_1',
      role: 'assistant',
      content:
        'Kumusta! Ako si Coco, ang iyong offline transit guide. Magtanong kung paano mag-commute papunta sa iyong destinasyon (halimbawa: "Lucena to SM Makati" o "PITX papuntang Cubao").',
      timestamp: Date.now(),
    },
  ],
  isGenerating: false,
  quickPrompts: [
    {
      id: 'qp_1',
      label: 'Lucena to SM Makati',
      prompt: 'Paano mag-commute mula Lucena Grand Terminal papuntang SM Makati / Ayala?',
      tag: 'Provincial',
    },
    {
      id: 'qp_2',
      label: 'PITX to Cubao Carousel',
      prompt: 'Paano sumakay mula PITX papuntang Cubao gamit ang EDSA Carousel?',
      tag: 'Busway',
    },
    {
      id: 'qp_3',
      label: 'Buendia to Ayala',
      prompt: 'Ano ang pinakamabilis na sakayan mula Gil Puyat Buendia papuntang Ayala Ave?',
      tag: 'Metro',
    },
    {
      id: 'qp_4',
      label: 'LRT-1 to MRT-3 Transfer',
      prompt: 'Paano lumipat mula LRT-1 EDSA Station papuntang MRT-3 Taft Avenue Station?',
      tag: 'Train',
    },
  ],

  isOfflineMode: true,
  memoryUsageMb: 0,
  deviceRamMb: 4096, // 4GB default RAM profile
  deviceStorageFreeMb: 14200, // ~14.2 GB free space default profile

  setActiveModelId: (modelId: string) =>
    set((state) => {
      const foundInBuiltin = AVAILABLE_MODELS[modelId];
      const foundInCustom = state.customModels.find((m) => m.id === modelId);
      const activeModel = foundInBuiltin || foundInCustom || AVAILABLE_MODELS[DEFAULT_MODEL_ID];
      return {
        activeModelId: modelId,
        activeModel,
      };
    }),

  setModelStatus: (modelId: string, status: ModelStatus) =>
    set((state) => ({
      modelStatus: { ...state.modelStatus, [modelId]: status },
    })),

  setDownloadProgress: (progress: number) => set({ downloadProgress: progress }),

  setDownloadStateForModel: (modelId: string, updates: Partial<ModelDownloadState>) =>
    set((state) => {
      const current = state.downloadStateMap[modelId] || {
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        isPaused: false,
      };
      const updated = { ...current, ...updates };
      return {
        downloadStateMap: {
          ...state.downloadStateMap,
          [modelId]: updated,
        },
        downloadProgress: updated.progress,
      };
    }),

  removeDownloadStateForModel: (modelId: string) =>
    set((state) => {
      const nextMap = { ...state.downloadStateMap };
      delete nextMap[modelId];
      return { downloadStateMap: nextMap };
    }),

  addCustomModel: (model: ModelDescriptor) =>
    set((state) => ({
      customModels: [...state.customModels.filter((m) => m.id !== model.id), model],
      modelStatus: { ...state.modelStatus, [model.id]: 'ready' },
    })),

  removeCustomModel: (modelId: string) =>
    set((state) => {
      const nextStatus = { ...state.modelStatus };
      delete nextStatus[modelId];
      const isRemovingActive = state.activeModelId === modelId;
      return {
        customModels: state.customModels.filter((m) => m.id !== modelId),
        modelStatus: nextStatus,
        activeModelId: isRemovingActive ? DEFAULT_MODEL_ID : state.activeModelId,
        activeModel: isRemovingActive
          ? AVAILABLE_MODELS[DEFAULT_MODEL_ID]
          : state.activeModel,
      };
    }),

  addMessage: (message: ChatMessage) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessageContent: (content: string, isStreaming = true) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length === 0) return { messages };
      const lastIndex = messages.length - 1;
      messages[lastIndex] = {
        ...messages[lastIndex],
        content,
        isStreaming,
      };
      return { messages };
    }),

  updateLastMessage: (updates: Partial<ChatMessage>) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length === 0) return { messages };
      const lastIndex = messages.length - 1;
      messages[lastIndex] = {
        ...messages[lastIndex],
        ...updates,
      };
      return { messages };
    }),

  clearMessages: () => set({ messages: [] }),
  setIsGenerating: (isGenerating: boolean) => set({ isGenerating }),
  setMemoryUsageMb: (memoryUsageMb: number) => set({ memoryUsageMb }),
  setDeviceStorageFreeMb: (deviceStorageFreeMb: number) =>
    set({ deviceStorageFreeMb }),
}));

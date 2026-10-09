import { create } from 'zustand';
import { ChatMessage, QuickPrompt } from '@/types/chat';
import { ModelDescriptor, ModelStatus } from '@/types/ai';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from '../ai/modelConfig';

interface AppState {
  // AI Model State
  activeModelId: string;
  modelStatus: Record<string, ModelStatus>;
  downloadProgress: number; // 0 to 100
  activeModel: ModelDescriptor;

  // Chat State
  messages: ChatMessage[];
  isGenerating: boolean;
  quickPrompts: QuickPrompt[];

  // App & Device Metrics
  isOfflineMode: boolean;
  memoryUsageMb: number;

  // Actions
  setActiveModelId: (modelId: string) => void;
  setModelStatus: (modelId: string, status: ModelStatus) => void;
  setDownloadProgress: (progress: number) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessageContent: (content: string, isStreaming?: boolean) => void;
  clearMessages: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setMemoryUsageMb: (mb: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModelId: DEFAULT_MODEL_ID,
  modelStatus: {
    'qwen2.5-1.5b-q4': 'not_downloaded',
    'qwen2.5-0.5b-q4': 'not_downloaded',
    'qwen2.5-3b-q4': 'not_downloaded',
  },
  downloadProgress: 0,
  activeModel: AVAILABLE_MODELS[DEFAULT_MODEL_ID],

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
      label: 'PITX to Cubao',
      prompt: 'Paano sumakay mula PITX papuntang Cubao gamit ang EDSA Carousel?',
      tag: 'Busway',
    },
    {
      id: 'qp_3',
      label: 'Buendia to Ayala',
      prompt: 'Ano ang pinakamabilis na sakayan mula Gil Puyat Buendia papuntang Ayala Ave?',
      tag: 'Metro',
    },
  ],

  isOfflineMode: true,
  memoryUsageMb: 0,

  setActiveModelId: (modelId: string) =>
    set({
      activeModelId: modelId,
      activeModel: AVAILABLE_MODELS[modelId] || AVAILABLE_MODELS[DEFAULT_MODEL_ID],
    }),

  setModelStatus: (modelId: string, status: ModelStatus) =>
    set((state) => ({
      modelStatus: { ...state.modelStatus, [modelId]: status },
    })),

  setDownloadProgress: (progress: number) => set({ downloadProgress: progress }),

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

  clearMessages: () => set({ messages: [] }),
  setIsGenerating: (isGenerating: boolean) => set({ isGenerating }),
  setMemoryUsageMb: (memoryUsageMb: number) => set({ memoryUsageMb }),
}));

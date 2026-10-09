import { useCallback } from 'react';
import { useAppStore } from '@/services/storage/useAppStore';
import { LlamaService } from '@/services/ai/LlamaService';
import { DEFAULT_SAMPLING_CONFIG } from '@/services/ai/modelConfig';
import { ChatMessage } from '@/types/chat';

export function useChat() {
  const messages = useAppStore((state) => state.messages);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const addMessage = useAppStore((state) => state.addMessage);
  const updateLastMessageContent = useAppStore((state) => state.updateLastMessageContent);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const quickPrompts = useAppStore((state) => state.quickPrompts);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isGenerating) return;

      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };
      addMessage(userMessage);

      const assistantMessageId = `assistant_${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };
      addMessage(assistantMessage);
      setIsGenerating(true);

      try {
        await LlamaService.generateStream(
          text,
          DEFAULT_SAMPLING_CONFIG,
          (_token, accumulated) => {
            updateLastMessageContent(accumulated, true);
          },
        );
        updateLastMessageContent(
          // Mark streaming completed
          useAppStore.getState().messages.slice(-1)[0]?.content || '',
          false,
        );
      } catch (err) {
        updateLastMessageContent(
          'Pasensya na, nagkaroon ng error sa inference engine. Pakisubukang muli.',
          false,
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, addMessage, setIsGenerating, updateLastMessageContent],
  );

  const stopGeneration = useCallback(async () => {
    await LlamaService.stopGeneration();
    setIsGenerating(false);
  }, [setIsGenerating]);

  return {
    messages,
    isGenerating,
    sendMessage,
    stopGeneration,
    quickPrompts,
  };
}

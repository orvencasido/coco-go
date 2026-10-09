import { useCallback } from 'react';
import { useAppStore } from '@/services/storage/useAppStore';
import { ChatOrchestrator } from '@/services/ai/ChatOrchestrator';
import { LlamaService } from '@/services/ai/LlamaService';
import { ChatMessage } from '@/types/chat';

export function useChat() {
  const messages = useAppStore((state) => state.messages);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const addMessage = useAppStore((state) => state.addMessage);
  const updateLastMessageContent = useAppStore((state) => state.updateLastMessageContent);
  const updateLastMessage = useAppStore((state) => state.updateLastMessage);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const quickPrompts = useAppStore((state) => state.quickPrompts);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isGenerating) {
        return;
      }

      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: trimmed,
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
        const result = await ChatOrchestrator.handleUserMessage(trimmed, {
          onToken: (_token, accumulated) => {
            updateLastMessageContent(accumulated, true);
          },
          onRoutesFound: (routes) => {
            if (routes.length > 0) {
              updateLastMessage({
                routeResult: routes[0],
                routeOptions: routes,
              });
            }
          },
        });

        // Finalize message with complete streamed content, route cards, and inference metrics
        updateLastMessage({
          content: result.content,
          isStreaming: false,
          metrics: result.metrics,
          routeResult: result.routeResult,
          routeOptions: result.routeOptions,
        });
      } catch (err) {
        console.error('[useChat] Error generating transit response:', err);
        updateLastMessage({
          content: 'Pasensya na, nagkaroon ng error sa transit assistant. Pakisubukang muli.',
          isStreaming: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, addMessage, setIsGenerating, updateLastMessageContent, updateLastMessage],
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

import { InferenceMetrics } from './ai';
import { TransitRouteOption } from './transit';

/**
 * Conversational Chat Types for coco-go
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  metrics?: InferenceMetrics;
  routeResult?: TransitRouteOption;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
  tag?: string;
}

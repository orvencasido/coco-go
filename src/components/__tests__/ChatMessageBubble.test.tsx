import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ChatMessageBubble } from '../ChatMessageBubble';
import { ChatMessage } from '@/types/chat';

describe('ChatMessageBubble', () => {
  it('renders user message properly', () => {
    const userMsg: ChatMessage = {
      id: 'msg_1',
      role: 'user',
      content: 'Paano magpunta mula Lucena papuntang SM Makati?',
      timestamp: Date.now(),
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ChatMessageBubble message={userMsg} />);
    });

    const root = renderer!.root;
    const content = root.findByProps({ testID: 'message-content' });
    expect(content.props.children).toContain('Paano magpunta mula Lucena papuntang SM Makati?');
  });

  it('renders assistant message with streaming state', () => {
    const streamingMsg: ChatMessage = {
      id: 'msg_2',
      role: 'assistant',
      content: 'Sumakay ng bus',
      timestamp: Date.now(),
      isStreaming: true,
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ChatMessageBubble message={streamingMsg} />);
    });

    const root = renderer!.root;
    const content = root.findByProps({ testID: 'message-content' });
    expect(content.props.children).toContain('Sumakay ng bus');
  });

  it('renders structured route cards and inference metrics', () => {
    const assistantRouteMsg: ChatMessage = {
      id: 'msg_3',
      role: 'assistant',
      content: 'Narito ang ruta papuntang Makati.',
      timestamp: Date.now(),
      routeResult: {
        id: 'route_1',
        origin: 'Lucena Grand Central Terminal',
        destination: 'SM Makati',
        totalEstimatedFare: 290,
        totalEstimatedMinutes: 195,
        transferCount: 1,
        verified: true,
        legs: [
          {
            stepOrder: 1,
            mode: 'bus',
            routeName: 'Lucena - Buendia Express',
            fromStop: 'Lucena Grand Central Terminal',
            toStop: 'Buendia Terminal',
            estimatedFare: 270,
            estimatedMinutes: 180,
            instructions: 'Board bus with signboard Buendia.',
          },
          {
            stepOrder: 2,
            mode: 'jeepney',
            routeName: 'Buendia - Ayala Jeepney',
            fromStop: 'Gil Puyat LRT',
            toStop: 'Ayala / SM Makati',
            estimatedFare: 20,
            estimatedMinutes: 15,
            instructions: 'Take jeepney heading towards Ayala Avenue.',
          },
        ],
      },
      metrics: {
        tokensGenerated: 45,
        generationSpeedTps: 18.5,
        promptTokens: 20,
        timeToFirstTokenMs: 80,
        totalDurationMs: 2432,
      },
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ChatMessageBubble message={assistantRouteMsg} />);
    });

    const root = renderer!.root;
    const routesContainer = root.findByProps({ testID: 'route-results-container' });
    expect(routesContainer).toBeDefined();

    const metricsContainer = root.findByProps({ testID: 'inference-metrics' });
    expect(metricsContainer).toBeDefined();
    expect(metricsContainer.props.children.props.children).toContain('18.5');
  });
});

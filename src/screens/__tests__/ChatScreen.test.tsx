import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { useAppStore } from '../../services/storage/useAppStore';
import { DEFAULT_MODEL_ID } from '../../services/ai/modelConfig';

const mockSend = jest.fn();
jest.mock('../../hooks/useChat', () => ({
  useChat: () => ({ messages: [], isGenerating: false, sendMessage: mockSend, stopGeneration: jest.fn(), quickPrompts: [] }),
}));
jest.mock('../../services/ai/DefaultModel', () => ({ initializeDefaultModel: jest.fn() }));

it('lets users type a draft during model loading and preserves it until sending becomes available', () => {
  useAppStore.setState({ modelStatus: { [DEFAULT_MODEL_ID]: 'loading' } });
  let screen!: TestRenderer.ReactTestRenderer;
  act(() => { screen = TestRenderer.create(<ChatScreen />); });
  const input = () => screen.root.findByProps({ testID: 'chat-input' });
  expect(input().props.editable).toBe(true);
  act(() => { input().props.onChangeText('Lucena to SM Makati'); });
  expect(input().props.value).toBe('Lucena to SM Makati');
  act(() => { input().props.onSubmitEditing(); });
  expect(mockSend).not.toHaveBeenCalled();
  expect(input().props.value).toBe('Lucena to SM Makati');
  act(() => { useAppStore.setState({ modelStatus: { [DEFAULT_MODEL_ID]: 'active' } }); });
  act(() => { input().props.onSubmitEditing(); });
  expect(mockSend).toHaveBeenCalledWith('Lucena to SM Makati');
  expect(input().props.value).toBe('');
  act(() => { screen.unmount(); });
});

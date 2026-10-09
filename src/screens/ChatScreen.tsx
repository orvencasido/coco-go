import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useChat } from '@/hooks/useChat';
import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { useAppStore } from '@/services/storage/useAppStore';

export const ChatScreen: React.FC = () => {
  const { messages, isGenerating, sendMessage, stopGeneration, quickPrompts } = useChat();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const activeModel = useAppStore((state) => state.activeModel);
  const isOfflineMode = useAppStore((state) => state.isOfflineMode);

  // Retrieve the latest inference metrics from the last completed assistant response
  const latestMetrics = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].metrics) {
        return messages[i].metrics;
      }
    }
    return null;
  }, [messages]);

  // Auto-scroll to latest message or streamed token
  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages, isGenerating]);

  const handleSend = () => {
    if (!inputText.trim() || isGenerating) return;
    sendMessage(inputText);
    setInputText('');
  };

  const handleChipPress = (prompt: string) => {
    if (isGenerating) return;
    sendMessage(prompt);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Offline & Model Status Header Bar */}
        <View style={styles.statusBar} testID="chat-status-bar">
          <View style={styles.statusLeft}>
            <View style={styles.indicatorGreen} />
            <Text style={styles.statusText}>
              {isOfflineMode ? '100% Offline Mode Active' : 'Online'}
            </Text>
            <Text style={styles.dividerDot}>•</Text>
            <Text style={styles.modelTag} numberOfLines={1}>
              {activeModel.name}
            </Text>
          </View>

          {/* Real-time TPS / Latency Badge */}
          {latestMetrics && (
            <View style={styles.metricsBadge} testID="metrics-badge">
              <Text style={styles.metricsBadgeText}>
                ⚡ {latestMetrics.generationSpeedTps.toFixed(1)} TPS
              </Text>
            </View>
          )}
        </View>

        {/* Message List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatMessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          testID="chat-messages-list"
        />

        {/* Quick Suggestion Chips */}
        <View style={styles.chipsContainer} testID="quick-prompts-container">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={quickPrompts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.chip, isGenerating && styles.disabledChip]}
                disabled={isGenerating}
                onPress={() => handleChipPress(item.prompt)}
                testID={`quick-prompt-${item.id}`}>
                {item.tag && <Text style={styles.chipTag}>{item.tag} · </Text>}
                <Text style={styles.chipText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Chat Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Tanong tungkol sa biyahe (hal. Lucena to SM Makati)..."
            placeholderTextColor="#94a3b8"
            editable={!isGenerating}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            testID="chat-input"
          />

          {isGenerating ? (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={stopGeneration}
              testID="chat-stop-btn"
              accessibilityLabel="Stop AI generation">
              <Text style={styles.stopButtonText}>⏹ Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.disabledButton]}
              disabled={!inputText.trim()}
              onPress={handleSend}
              testID="chat-send-btn"
              accessibilityLabel="Send commute question">
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  indicatorGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  dividerDot: {
    marginHorizontal: 5,
    color: '#cbd5e1',
    fontSize: 10,
  },
  modelTag: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    flexShrink: 1,
  },
  metricsBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metricsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  messageList: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  chipsContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  chipText: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '600',
  },
  disabledChip: {
    opacity: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: '#f1f5f9',
    borderRadius: 21,
    paddingHorizontal: 16,
    fontSize: 13,
    color: '#0f172a',
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0284c7',
    borderRadius: 21,
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  disabledButton: {
    opacity: 0.4,
  },
  stopButton: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ef4444',
    borderRadius: 21,
  },
  stopButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});

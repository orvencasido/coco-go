import React, { useState } from 'react';
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
  const activeModel = useAppStore((state) => state.activeModel);
  const isOfflineMode = useAppStore((state) => state.isOfflineMode);

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Offline & Model Status Bar */}
        <View style={styles.statusBar}>
          <View style={styles.badgeRow}>
            <View style={styles.indicatorGreen} />
            <Text style={styles.statusText}>
              {isOfflineMode ? '100% Offline Mode' : 'Online'} · {activeModel.name}
            </Text>
          </View>
        </View>

        {/* Message List */}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatMessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
        />

        {/* Quick Suggestion Chips */}
        <View style={styles.chipsContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={quickPrompts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.chip}
                onPress={() => sendMessage(item.prompt)}>
                <Text style={styles.chipText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Tanong tungkol sa biyahe..."
            placeholderTextColor="#94a3b8"
            editable={!isGenerating}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          {isGenerating ? (
            <TouchableOpacity style={styles.stopButton} onPress={stopGeneration}>
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.disabledButton]}
              disabled={!inputText.trim()}
              onPress={handleSend}>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicatorGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  messageList: {
    padding: 16,
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
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipText: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
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
    fontSize: 14,
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
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
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
    fontWeight: '600',
    fontSize: 13,
  },
});

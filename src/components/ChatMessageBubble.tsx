import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { ChatMessage } from '@/types/chat';

interface Props {
  message: ChatMessage;
}

export const ChatMessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}>
      {!isUser && <Text style={styles.senderLabel}>Coco Transit AI</Text>}
      <Text style={[styles.bodyText, isUser ? styles.userText : styles.assistantText]}>
        {message.content}
        {message.isStreaming && <Text style={styles.cursor}> ▍</Text>}
      </Text>
      {message.metrics && (
        <View style={styles.metricsContainer}>
          <Text style={styles.metricsText}>
            {message.metrics.generationSpeedTps.toFixed(1)} tps · {message.metrics.tokensGenerated} tokens
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginVertical: 4,
  },
  userContainer: {
    alignSelf: 'flex-end',
    backgroundColor: '#0066cc',
    borderBottomRightRadius: 4,
  },
  assistantContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f3f6',
    borderBottomLeftRadius: 4,
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#667085',
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#1d2939',
  },
  cursor: {
    color: '#0066cc',
    fontWeight: 'bold',
  },
  metricsContainer: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d5dd',
    paddingTop: 4,
  },
  metricsText: {
    fontSize: 10,
    color: '#98a2b3',
  },
});

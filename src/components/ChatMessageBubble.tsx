import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ChatMessage } from '@/types/chat';
import { RouteLegCard } from './RouteLegCard';

interface Props {
  message: ChatMessage;
}

export const ChatMessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';
  const primaryRoute = message.routeResult || (message.routeOptions && message.routeOptions[0]);
  const [showRouteLegs, setShowRouteLegs] = useState(true);

  return (
    <View
      style={[
        styles.wrapper,
        isUser ? styles.userWrapper : styles.assistantWrapper,
      ]}
      testID={`chat-message-${message.id}`}>
      <View
        style={[
          styles.container,
          isUser ? styles.userContainer : styles.assistantContainer,
        ]}>
        {/* Assistant Header Tag */}
        {!isUser && (
          <View style={styles.assistantHeader}>
            <View style={styles.avatarPill}>
              <Text style={styles.avatarIcon}>🥥</Text>
              <Text style={styles.senderLabel}>Coco Transit AI</Text>
            </View>
            <View style={styles.offlinePill}>
              <Text style={styles.offlinePillText}>100% Offline</Text>
            </View>
          </View>
        )}

        {/* Message Content */}
        {message.content ? (
          <Text
            style={[styles.bodyText, isUser ? styles.userText : styles.assistantText]}
            testID="message-content">
            {message.content}
            {message.isStreaming && <Text style={styles.cursor}> ▍</Text>}
          </Text>
        ) : message.isStreaming ? (
          <Text style={[styles.bodyText, styles.assistantText]} testID="streaming-placeholder">
            Kinakalkula ang ruta at transit options...
            <Text style={styles.cursor}> ▍</Text>
          </Text>
        ) : null}

        {/* Error notice if present */}
        {message.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {message.error}</Text>
          </View>
        )}

        {/* Structured Route Card */}
        {primaryRoute && primaryRoute.legs.length > 0 && (
          <View style={styles.routesContainer} testID="route-results-container">
            <TouchableOpacity
              style={styles.routeHeaderRow}
              activeOpacity={0.8}
              onPress={() => setShowRouteLegs((prev) => !prev)}>
              <View style={styles.routeHeaderLeft}>
                <Text style={styles.routeHeaderTitle}>
                  {primaryRoute.origin} ➔ {primaryRoute.destination}
                </Text>
                <Text style={styles.routeHeaderSubtitle}>
                  ₱{primaryRoute.totalEstimatedFare} · ~{primaryRoute.totalEstimatedMinutes} mins ·{' '}
                  {primaryRoute.transferCount === 0
                    ? 'Direct'
                    : `${primaryRoute.transferCount} transfer(s)`}
                </Text>
              </View>
              <View style={styles.togglePill}>
                <Text style={styles.togglePillText}>
                  {showRouteLegs ? 'Hide Steps ▲' : 'View Steps ▼'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Step-by-Step Leg Cards */}
            {showRouteLegs && (
              <View style={styles.legsList}>
                {primaryRoute.legs.map((leg, idx) => (
                  <RouteLegCard
                    key={`leg_${leg.stepOrder}_${idx}`}
                    leg={leg}
                    defaultExpanded={true}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Inference Performance Metrics */}
        {message.metrics && !isUser && (
          <View style={styles.metricsContainer} testID="inference-metrics">
            <Text style={styles.metricsText}>
              ⚡ {message.metrics.generationSpeedTps.toFixed(1)} tps ·{' '}
              {message.metrics.tokensGenerated} tokens · {message.metrics.totalDurationMs}ms
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
    paddingHorizontal: 8,
  },
  userWrapper: {
    alignItems: 'flex-end',
  },
  assistantWrapper: {
    alignItems: 'flex-start',
  },
  container: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userContainer: {
    backgroundColor: '#0284c7',
    borderBottomRightRadius: 4,
  },
  assistantContainer: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  assistantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 4,
  },
  avatarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  avatarIcon: {
    fontSize: 12,
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  offlinePill: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlinePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userText: {
    color: '#ffffff',
    fontWeight: '500',
  },
  assistantText: {
    color: '#1e293b',
  },
  cursor: {
    color: '#0284c7',
    fontWeight: 'bold',
  },
  errorBox: {
    marginTop: 6,
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 11,
    color: '#b91c1c',
  },
  routesContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  routeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  routeHeaderLeft: {
    flex: 1,
  },
  routeHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  routeHeaderSubtitle: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '600',
    marginTop: 2,
  },
  togglePill: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  togglePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  legsList: {
    marginTop: 4,
  },
  metricsContainer: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    paddingTop: 6,
  },
  metricsText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
});

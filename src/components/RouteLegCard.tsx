import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { RouteLeg } from '@/types/transit';

interface Props {
  leg: RouteLeg;
}

const MODE_COLORS: Record<string, string> = {
  bus: '#0d9488',
  mrt: '#2563eb',
  lrt: '#16a34a',
  jeepney: '#d97706',
  uv: '#7c3aed',
  pnr: '#dc2626',
  ferry: '#0284c7',
  walk: '#64748b',
};

export const RouteLegCard: React.FC<Props> = ({ leg }) => {
  const badgeColor = MODE_COLORS[leg.mode] || '#64748b';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{leg.mode.toUpperCase()}</Text>
        </View>
        <Text style={styles.routeTitle}>{leg.routeName || leg.operator || 'Transit Leg'}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.stopText}>
          <Text style={styles.bold}>From:</Text> {leg.fromStop}
        </Text>
        <Text style={styles.stopText}>
          <Text style={styles.bold}>To:</Text> {leg.toStop}
        </Text>
        <Text style={styles.instructionsText}>{leg.instructions}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerMeta}>Est. Fare: ₱{leg.estimatedFare}</Text>
        <Text style={styles.footerMeta}>~{leg.estimatedMinutes} mins</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  routeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  content: {
    marginVertical: 4,
  },
  stopText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 2,
  },
  bold: {
    fontWeight: '600',
    color: '#334155',
  },
  instructionsText: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    paddingTop: 6,
    marginTop: 6,
  },
  footerMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
});

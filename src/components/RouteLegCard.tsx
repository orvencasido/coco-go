import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { RouteLeg, TransitMode } from '@/types/transit';

interface Props {
  leg: RouteLeg;
  defaultExpanded?: boolean;
}

interface ModeTheme {
  label: string;
  badgeBg: string;
  badgeText: string;
  cardBorder: string;
  iconText: string;
}

const MODE_THEMES: Record<string, ModeTheme> = {
  bus: {
    label: 'BUS',
    badgeBg: '#0d9488',
    badgeText: '#ffffff',
    cardBorder: '#ccfbf1',
    iconText: '🚌',
  },
  mrt: {
    label: 'MRT-3',
    badgeBg: '#2563eb',
    badgeText: '#ffffff',
    cardBorder: '#dbeafe',
    iconText: '🚆',
  },
  lrt: {
    label: 'LRT',
    badgeBg: '#16a34a',
    badgeText: '#ffffff',
    cardBorder: '#dcfce7',
    iconText: '🚊',
  },
  jeepney: {
    label: 'JEEPNEY',
    badgeBg: '#ea580c',
    badgeText: '#ffffff',
    cardBorder: '#ffedd5',
    iconText: '🚐',
  },
  uv: {
    label: 'UV EXPRESS',
    badgeBg: '#7c3aed',
    badgeText: '#ffffff',
    cardBorder: '#ede9fe',
    iconText: '🚐',
  },
  pnr: {
    label: 'PNR',
    badgeBg: '#dc2626',
    badgeText: '#ffffff',
    cardBorder: '#fee2e2',
    iconText: '🚂',
  },
  ferry: {
    label: 'FERRY',
    badgeBg: '#0284c7',
    badgeText: '#ffffff',
    cardBorder: '#e0f2fe',
    iconText: '⛴️',
  },
  walk: {
    label: 'WALK',
    badgeBg: '#64748b',
    badgeText: '#ffffff',
    cardBorder: '#f1f5f9',
    iconText: '🚶',
  },
};

function resolveModeTheme(mode: TransitMode, routeName?: string): ModeTheme {
  const normalized = (mode || 'bus').toLowerCase();
  const theme = MODE_THEMES[normalized] || MODE_THEMES.bus;

  // Refine label if routeName mentions specific LRT lines or carousel
  if (routeName?.includes('LRT-1')) {
    return { ...theme, label: 'LRT-1' };
  }
  if (routeName?.includes('LRT-2')) {
    return { ...theme, label: 'LRT-2', badgeBg: '#9333ea' };
  }
  if (routeName?.includes('EDSA Carousel') || routeName?.includes('Busway')) {
    return { ...theme, label: 'EDSA BUSWAY', badgeBg: '#d97706' };
  }

  return theme;
}

export const RouteLegCard: React.FC<Props> = ({ leg, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const theme = resolveModeTheme(leg.mode, leg.routeName);

  const displayFare =
    leg.estimatedFare === 0 ? 'Free Transfer' : `₱${leg.estimatedFare}`;

  return (
    <View style={[styles.card, { borderColor: theme.cardBorder }]} testID={`route-leg-${leg.stepOrder}`}>
      {/* Leg Header Row */}
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.7}
        onPress={() => setIsExpanded((prev) => !prev)}>
        <View style={styles.headerLeft}>
          <View style={[styles.stepBadge, { backgroundColor: '#f1f5f9' }]}>
            <Text style={styles.stepBadgeText}>Step {leg.stepOrder}</Text>
          </View>
          <View style={[styles.modeBadge, { backgroundColor: theme.badgeBg }]}>
            <Text style={styles.modeBadgeText}>
              {theme.iconText} {theme.label}
            </Text>
          </View>
          <Text style={styles.routeTitle} numberOfLines={1}>
            {leg.routeName || leg.operator || 'Transit Leg'}
          </Text>
        </View>

        <View style={styles.expandToggle}>
          <Text style={styles.expandToggleText}>{isExpanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {/* Stop Information */}
      <View style={styles.stopsContainer}>
        <View style={styles.stopRow}>
          <View style={[styles.stopDot, styles.dotOrigin]} />
          <Text style={styles.stopText}>
            <Text style={styles.stopLabel}>From: </Text>
            {leg.fromStop}
          </Text>
        </View>

        <View style={styles.connectingLine} />

        <View style={styles.stopRow}>
          <View style={[styles.stopDot, styles.dotDest]} />
          <Text style={styles.stopText}>
            <Text style={styles.stopLabel}>To: </Text>
            {leg.toStop}
          </Text>
        </View>
      </View>

      {/* Expandable Details & Instructions */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {leg.instructions ? (
            <View style={styles.tipBox}>
              <Text style={styles.tipIcon}>💡</Text>
              <Text style={styles.instructionsText}>{leg.instructions}</Text>
            </View>
          ) : null}

          {leg.operator && leg.routeName && (
            <Text style={styles.operatorText}>Operator: {leg.operator}</Text>
          )}
        </View>
      )}

      {/* Footer Metrics (Fare & Time) */}
      <View style={styles.footer}>
        <Text style={styles.fareText} testID="leg-fare">
          {displayFare}
        </Text>
        <Text style={styles.timeText} testID="leg-time">
          ⏱️ ~{leg.estimatedMinutes} mins
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  stepBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modeBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  routeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  expandToggle: {
    paddingHorizontal: 4,
  },
  expandToggleText: {
    fontSize: 10,
    color: '#94a3b8',
  },
  stopsContainer: {
    paddingLeft: 4,
    marginVertical: 4,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotOrigin: {
    backgroundColor: '#0284c7',
  },
  dotDest: {
    backgroundColor: '#10b981',
  },
  connectingLine: {
    width: 2,
    height: 12,
    backgroundColor: '#cbd5e1',
    marginLeft: 3,
    marginVertical: 1,
  },
  stopText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  stopLabel: {
    fontWeight: '600',
    color: '#64748b',
  },
  expandedContent: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: 'flex-start',
    gap: 6,
  },
  tipIcon: {
    fontSize: 12,
  },
  instructionsText: {
    fontSize: 11,
    color: '#92400e',
    lineHeight: 16,
    flex: 1,
    fontWeight: '500',
  },
  operatorText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    marginTop: 8,
  },
  fareText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
});

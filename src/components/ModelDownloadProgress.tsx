import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

export interface ModelDownloadProgressProps {
  progress: number; // 0 to 100
  downloadedBytes?: number;
  totalBytes?: number;
  isPaused?: boolean;
  statusText?: string;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export const ModelDownloadProgress: React.FC<ModelDownloadProgressProps> = ({
  progress,
  downloadedBytes,
  totalBytes,
  isPaused = false,
  statusText,
  onPause,
  onResume,
  onCancel,
}) => {
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const displayStatus =
    statusText || (isPaused ? 'Download paused' : clampedProgress >= 100 ? 'Finalizing model...' : 'Downloading weights...');

  return (
    <View style={styles.container} testID="model-download-progress">
      {/* Header Info */}
      <View style={styles.headerRow}>
        <View style={styles.statusLabelContainer}>
          <View style={[styles.statusDot, isPaused ? styles.dotPaused : styles.dotActive]} />
          <Text style={styles.statusText}>{displayStatus}</Text>
        </View>
        <Text style={styles.percentageText} testID="download-percentage">
          {clampedProgress}%
        </Text>
      </View>

      {/* Progress Track & Bar */}
      <View style={styles.track} testID="download-progress-track">
        <View
          style={[
            styles.bar,
            { width: `${clampedProgress}%` },
            isPaused && styles.barPaused,
          ]}
          testID="download-progress-bar"
        />
      </View>

      {/* Footer Info & Actions */}
      <View style={styles.footerRow}>
        <Text style={styles.bytesText} testID="download-bytes-text">
          {downloadedBytes !== undefined && totalBytes !== undefined
            ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
            : `${clampedProgress}% downloaded`}
        </Text>

        <View style={styles.buttonGroup}>
          {isPaused ? (
            onResume && (
              <TouchableOpacity
                style={[styles.btn, styles.resumeBtn]}
                onPress={onResume}
                testID="download-resume-btn"
                accessibilityLabel="Resume download">
                <Text style={styles.btnText}>Resume</Text>
              </TouchableOpacity>
            )
          ) : (
            onPause && (
              <TouchableOpacity
                style={[styles.btn, styles.pauseBtn]}
                onPress={onPause}
                testID="download-pause-btn"
                accessibilityLabel="Pause download">
                <Text style={styles.btnText}>Pause</Text>
              </TouchableOpacity>
            )
          )}

          {onCancel && (
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={onCancel}
              testID="download-cancel-btn"
              accessibilityLabel="Cancel download">
              <Text style={[styles.btnText, styles.cancelBtnText]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginVertical: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotActive: {
    backgroundColor: '#0284c7',
  },
  dotPaused: {
    backgroundColor: '#f59e0b',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  percentageText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  track: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: '#0284c7',
    borderRadius: 4,
  },
  barPaused: {
    backgroundColor: '#f59e0b',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  bytesText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtn: {
    backgroundColor: '#e2e8f0',
  },
  resumeBtn: {
    backgroundColor: '#0284c7',
  },
  cancelBtn: {
    backgroundColor: '#fee2e2',
  },
  btnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
  },
  cancelBtnText: {
    color: '#dc2626',
  },
});

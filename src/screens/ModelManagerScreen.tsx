import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useModelManager } from '@/hooks/useModelManager';
import { ModelDescriptor } from '@/types/ai';
import { ModelDownloadProgress } from '@/components/ModelDownloadProgress';

export const ModelManagerScreen: React.FC = () => {
  const {
    activeModelId,
    availableModelsList,
    modelStatus,
    downloadStateMap,
    deviceInfo,
    selectModel,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    deleteModel,
    sideloadModel,
  } = useModelManager();

  // Sideload Modal State
  const [showSideloadModal, setShowSideloadModal] = useState(false);
  const [sideloadPath, setSideloadPath] = useState('');
  const [sideloadName, setSideloadName] = useState('');
  const [sideloadError, setSideloadError] = useState<string | null>(null);

  const handleSideloadSubmit = async () => {
    if (!sideloadPath.trim()) {
      setSideloadError('Please enter a valid file path.');
      return;
    }

    setSideloadError(null);
    const result = await sideloadModel(sideloadPath.trim(), {
      name: sideloadName.trim() || undefined,
    });

    if (result.success && result.model) {
      setShowSideloadModal(false);
      setSideloadPath('');
      setSideloadName('');
      Alert.alert('Success', `Model "${result.model.name}" imported successfully.`);
    } else {
      setSideloadError(result.error || 'Failed to import GGUF model.');
    }
  };

  const renderModelItem = ({ item }: { item: ModelDescriptor }) => {
    const isSelected = item.id === activeModelId;
    const status = modelStatus[item.id] || 'not_downloaded';
    const sizeMb = (item.sizeBytes / (1024 * 1024)).toFixed(0);
    const isRecommended = item.id === deviceInfo.recommendedModelId;
    const downloadState = downloadStateMap[item.id];

    return (
      <View
        style={[styles.modelCard, isSelected && styles.selectedCard]}
        testID={`model-card-${item.id}`}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.modelName}>{item.name}</Text>
            {isRecommended && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedBadgeText}>RECOMMENDED FOR YOUR DEVICE</Text>
              </View>
            )}
          </View>
          <View
            style={[
              styles.tierBadge,
              item.tier === 'standard' && styles.standardTier,
              item.tier === 'ultra_light' && styles.lightTier,
              item.tier === 'power' && styles.powerTier,
              item.isCustom && styles.customTier,
            ]}>
            <Text style={styles.tierText}>
              {item.isCustom ? 'CUSTOM GGUF' : item.tier.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{item.description}</Text>

        {/* Metadata Row */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>📦 ~{sizeMb} MB</Text>
          <Text style={styles.metaText}>⚙️ {item.quantization}</Text>
          <Text style={styles.metaText}>🧠 Min RAM: {item.minRamMb} MB</Text>
          <Text style={styles.metaText}>🪟 Ctx: {item.contextWindow}</Text>
        </View>

        {/* Progress or Actions */}
        <View style={styles.actionRow}>
          {status === 'downloading' ? (
            <ModelDownloadProgress
              progress={downloadState?.progress || 0}
              downloadedBytes={downloadState?.downloadedBytes}
              totalBytes={downloadState?.totalBytes || item.sizeBytes}
              isPaused={downloadState?.isPaused || false}
              statusText={downloadState?.statusText}
              onPause={() => pauseDownload(item.id)}
              onResume={() => resumeDownload(item.id)}
              onCancel={() => cancelDownload(item.id)}
            />
          ) : status === 'ready' || status === 'active' ? (
            <View style={styles.readyActionsContainer}>
              <TouchableOpacity
                style={[styles.selectBtn, isSelected && styles.activeBtn]}
                onPress={() => selectModel(item)}
                testID={`activate-btn-${item.id}`}>
                <Text
                  style={[
                    styles.selectBtnText,
                    isSelected && styles.activeBtnText,
                  ]}>
                  {isSelected ? '✓ Active Model' : 'Activate Model'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => deleteModel(item.id)}
                testID={`delete-btn-${item.id}`}
                accessibilityLabel="Delete model file">
                <Text style={styles.deleteBtnText}>🗑️ Free Space</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => startDownload(item.id)}
              testID={`download-btn-${item.id}`}>
              <Text style={styles.downloadBtnText}>
                📥 Download GGUF (~{sizeMb} MB)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Offline AI Models</Text>
        <Text style={styles.subtitle}>
          Run Small Language Models 100% on-device. Zero data leaves your phone.
        </Text>
      </View>

      {/* Hardware Profile Summary */}
      <View style={styles.deviceCard} testID="device-summary-card">
        <View style={styles.deviceCardHeader}>
          <Text style={styles.deviceTitle}>📱 Hardware Memory Profile</Text>
          <View style={styles.offlineStatusBadge}>
            <View style={styles.greenPulse} />
            <Text style={styles.offlineStatusText}>Offline Engine Ready</Text>
          </View>
        </View>

        <View style={styles.deviceStatsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>DEVICE RAM</Text>
            <Text style={styles.statValue}>{(deviceInfo.ramMb / 1024).toFixed(0)} GB</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>FREE STORAGE</Text>
            <Text style={styles.statValue}>
              {(deviceInfo.storageFreeMb / 1024).toFixed(1)} GB
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>RECOMMENDED</Text>
            <Text style={styles.statValueRecommended}>
              {deviceInfo.recommendedModelId === 'qwen2.5-0.5b-q4'
                ? '0.5B Light'
                : deviceInfo.recommendedModelId === 'qwen2.5-3b-q4'
                ? '3B Power'
                : '1.5B Standard'}
            </Text>
          </View>
        </View>
      </View>

      {/* Sideload Trigger Button */}
      <View style={styles.sideloadHeader}>
        <Text style={styles.sectionTitle}>Installed & Available Models</Text>
        <TouchableOpacity
          style={styles.sideloadTriggerBtn}
          onPress={() => setShowSideloadModal(true)}
          testID="open-sideload-modal-btn">
          <Text style={styles.sideloadTriggerText}>+ Import GGUF</Text>
        </TouchableOpacity>
      </View>

      {/* Model Cards List */}
      <FlatList
        data={availableModelsList}
        keyExtractor={(item) => item.id}
        renderItem={renderModelItem}
        contentContainerStyle={styles.listContainer}
      />

      {/* Sideload Modal */}
      <Modal
        visible={showSideloadModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSideloadModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Import Custom GGUF Model</Text>
            <Text style={styles.modalSubtitle}>
              Specify the local filesystem path to a compatible Qwen2.5 GGUF model file on your phone.
            </Text>

            <Text style={styles.inputLabel}>File Path (.gguf)</Text>
            <TextInput
              style={styles.modalInput}
              value={sideloadPath}
              onChangeText={setSideloadPath}
              placeholder="/sdcard/Download/model.gguf"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              testID="sideload-path-input"
            />

            <Text style={styles.inputLabel}>Display Name (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={sideloadName}
              onChangeText={setSideloadName}
              placeholder="e.g. Qwen 2.5 1.5B Custom"
              placeholderTextColor="#94a3b8"
              testID="sideload-name-input"
            />

            {sideloadError && (
              <Text style={styles.modalErrorText}>{sideloadError}</Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowSideloadModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalImportBtn}
                onPress={handleSideloadSubmit}
                testID="sideload-submit-btn">
                <Text style={styles.modalImportBtnText}>Import Model</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
  deviceCard: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  deviceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  deviceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  offlineStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  greenPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
  },
  offlineStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16a34a',
  },
  deviceStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  statValueRecommended: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284c7',
    marginTop: 2,
  },
  sideloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  sideloadTriggerBtn: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  sideloadTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
  },
  modelCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectedCard: {
    borderColor: '#0284c7',
    borderWidth: 2,
    backgroundColor: '#f0f9ff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  recommendedBadge: {
    backgroundColor: '#ecfdf5',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  standardTier: {
    backgroundColor: '#dbeafe',
  },
  lightTier: {
    backgroundColor: '#fef3c7',
  },
  powerTier: {
    backgroundColor: '#fae8ff',
  },
  customTier: {
    backgroundColor: '#f3e8ff',
  },
  tierText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
  },
  description: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    flexWrap: 'wrap',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  actionRow: {
    marginTop: 8,
  },
  readyActionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  selectBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeBtn: {
    backgroundColor: '#059669',
  },
  selectBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
  },
  activeBtnText: {
    color: '#ffffff',
  },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 12,
  },
  downloadBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 12,
  },
  modalErrorText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modalImportBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#0284c7',
  },
  modalImportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
});

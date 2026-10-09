import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useModelManager } from '@/hooks/useModelManager';
import { ModelDescriptor } from '@/types/ai';

export const ModelManagerScreen: React.FC = () => {
  const {
    activeModelId,
    availableModelsList,
    modelStatus,
    downloadProgress,
    selectModel,
    startDownload,
  } = useModelManager();

  const renderModelItem = ({ item }: { item: ModelDescriptor }) => {
    const isSelected = item.id === activeModelId;
    const status = modelStatus[item.id] || 'not_downloaded';
    const sizeMb = (item.sizeBytes / (1024 * 1024)).toFixed(0);

    return (
      <View style={[styles.modelCard, isSelected && styles.selectedCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.modelName}>{item.name}</Text>
          <View style={[styles.tierBadge, item.tier === 'standard' && styles.standardTier]}>
            <Text style={styles.tierText}>{item.tier.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.description}>{item.description}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Size: ~{sizeMb} MB</Text>
          <Text style={styles.metaText}>Quant: {item.quantization}</Text>
          <Text style={styles.metaText}>Min RAM: {item.minRamMb} MB</Text>
        </View>

        <View style={styles.actionRow}>
          {status === 'ready' || status === 'active' ? (
            <TouchableOpacity
              style={[styles.selectBtn, isSelected && styles.activeBtn]}
              onPress={() => selectModel(item)}>
              <Text style={styles.selectBtnText}>{isSelected ? 'Active' : 'Select'}</Text>
            </TouchableOpacity>
          ) : status === 'downloading' ? (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>Downloading {downloadProgress}%...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => startDownload(item.id)}>
              <Text style={styles.downloadBtnText}>Download GGUF</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Offline AI Models</Text>
        <Text style={styles.subtitle}>
          Manage Small Language Models stored directly on your phone storage.
        </Text>
      </View>
      <FlatList
        data={availableModelsList}
        keyExtractor={(item) => item.id}
        renderItem={renderModelItem}
        contentContainerStyle={styles.listContainer}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
  },
  modelCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectedCard: {
    borderColor: '#0284c7',
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  standardTier: {
    backgroundColor: '#dbeafe',
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  description: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  metaText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  actionRow: {
    marginTop: 10,
  },
  downloadBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  selectBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeBtn: {
    backgroundColor: '#10b981',
  },
  selectBtnText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 13,
  },
  progressContainer: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '600',
  },
});

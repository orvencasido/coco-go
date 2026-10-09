import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { ChatScreen } from '@/screens/ChatScreen';
import { ModelManagerScreen } from '@/screens/ModelManagerScreen';

type Tab = 'chat' | 'models';

export default function App(): React.JSX.Element {
  const [currentTab, setCurrentTab] = useState<Tab>('chat');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {/* Top App Header */}
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.brandTitle}>coco-go</Text>
          <Text style={styles.brandSubtitle}>Offline PH Transit AI</Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, currentTab === 'chat' && styles.activeTabButton]}
            onPress={() => setCurrentTab('chat')}>
            <Text
              style={[styles.tabText, currentTab === 'chat' && styles.activeTabText]}>
              Chat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, currentTab === 'models' && styles.activeTabButton]}
            onPress={() => setCurrentTab('models')}>
            <Text
              style={[styles.tabText, currentTab === 'models' && styles.activeTabText]}>
              Models
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Screen Content */}
      <View style={styles.content}>
        {currentTab === 'chat' ? <ChatScreen /> : <ModelManagerScreen />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeTabButton: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#0284c7',
  },
  content: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});

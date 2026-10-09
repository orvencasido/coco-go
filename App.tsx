import React, { useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
} from 'react-native';
import { ChatScreen } from '@/screens/ChatScreen';
import { initializeDefaultModel } from '@/services/ai/DefaultModel';

export default function App(): React.JSX.Element {
  useEffect(() => {
    void initializeDefaultModel();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {/* Top App Header */}
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.brandTitle}>coco-go</Text>
          <Text style={styles.brandSubtitle}>Offline PH Transit AI</Text>
        </View>
      </View>

      {/* Screen Content */}
      <View style={styles.content}>
        <ChatScreen />
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
  content: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});

import React from 'react';
import { AppRegistry, View, StyleSheet } from 'react-native';
import App from '../App';

const WebContainer: React.FC = () => {
  return (
    <div className="phone-frame">
      <App />
    </div>
  );
};

AppRegistry.registerComponent('CocoGoWeb', () => WebContainer);

const rootTag = document.getElementById('root');
if (rootTag) {
  AppRegistry.runApplication('CocoGoWeb', {
    rootTag,
  });
}

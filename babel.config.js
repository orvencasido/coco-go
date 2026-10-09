module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@components': './src/components',
          '@services': './src/services',
          '@hooks': './src/hooks',
          '@types': './src/types',
          '@screens': './src/screens',
          '@assets': './src/assets',
        },
      },
    ],
  ],
};

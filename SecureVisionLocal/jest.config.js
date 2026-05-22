module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-vector-icons|react-native-safe-area-context|react-native-screens|react-native-gesture-handler|react-native-reanimated|react-native-worklets|react-native-fs|react-native-video)/)',
  ],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-fs', () => ({
  RNFSFileTypeRegular: 0,
  DocumentDirectoryPath: '',
  CachesDirectoryPath: '',
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  readDir: jest.fn(() => Promise.resolve([])),
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  stat: jest.fn(() => Promise.resolve({})),
}));

jest.mock('react-native-video', () => 'Video');

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ type: 'wifi', isConnected: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // stub out all expo/* and react-native modules — unit tests target pure TS logic only
    '^expo-location$': '<rootDir>/src/__mocks__/expo-location.ts',
    '^expo-task-manager$': '<rootDir>/src/__mocks__/expo-task-manager.ts',
    '^expo-battery$': '<rootDir>/src/__mocks__/expo-battery.ts',
    '^expo-network$': '<rootDir>/src/__mocks__/expo-network.ts',
    '^expo-device$': '<rootDir>/src/__mocks__/expo-device.ts',
    '^expo-constants$': '<rootDir>/src/__mocks__/expo-constants.ts',
    '^expo-sensors$': '<rootDir>/src/__mocks__/expo-sensors.ts',
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    '^react-native$': '<rootDir>/src/__mocks__/react-native.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/__tests__/**', '!src/__mocks__/**'],
  coverageReporters: ['text', 'lcov'],
};

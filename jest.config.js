/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.ts'],
  moduleNameMapper: {},
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Relax some options for test environment
        module: 'commonjs',
        esModuleInterop: true,
        allowJs: true,
      },
    }],
  },
  // Don't transform node_modules (except what's needed)
  transformIgnorePatterns: [
    '/node_modules/',
  ],
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/**/*.d.ts',
    '!server/index.ts',
  ],
};

export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: ['src/calculator.js:21:3-21:33'],
  reporters: ['clear-text', 'json'],
  jsonReporter: {
    fileName: process.env.MUTATION_REPORT ?? '.mutation-tmp/mutation.json',
  },
  concurrency: 2,
  cleanTempDir: 'always',
};

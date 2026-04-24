import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: process.env.INTEGRATION ? [] : ['tests/integration.test.ts'],
    testTimeout: process.env.INTEGRATION ? 30000 : 5000,
  },
});

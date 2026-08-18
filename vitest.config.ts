import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'desktop',
          root: './apps/desktop',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'token-server',
          root: './apps/token-server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});

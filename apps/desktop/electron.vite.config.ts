import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/**
 * Workspace packages must be bundled, not externalized. They are listed as
 * dependencies, so externalizeDepsPlugin would leave bare `@nigord/*` requires
 * in the output — which resolve in the monorepo during development and fail on
 * a packaged install, where node_modules does not contain them.
 */
const workspacePackages = ['@nigord/shared', '@nigord/core', '@nigord/ui'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      lib: { entry: resolve(__dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      // CommonJS: a sandboxed preload cannot be an ES module.
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});

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

/**
 * Endereço e segredo do grupo entram no binário no momento do build, não numa
 * tela de primeira execução (src/main/config/connection.ts). Ficam vazios num
 * build de desenvolvimento: ali o ambiente supre.
 */
const connectionDefines = {
  __NIGORD_TOKEN_SERVER__: JSON.stringify(process.env['NIGORD_TOKEN_SERVER'] ?? ''),
  __NIGORD_GROUP_SECRET__: JSON.stringify(process.env['NIGORD_GROUP_SECRET'] ?? ''),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    define: connectionDefines,
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

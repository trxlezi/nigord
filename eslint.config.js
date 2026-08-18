import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The `no-restricted-imports` block on packages/** is load-bearing, not style.
 * design.md D4 depends on packages/core staying free of Electron and of the
 * renderer's DOM globals, because that is what makes the session state machine
 * testable on Linux without opening a window. A lint rule is the only thing
 * that keeps that boundary from eroding one convenient import at a time.
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-types/**', '**/out/**', '**/release/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/core/**/*.ts', 'packages/shared/**/*.ts', 'packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message:
                'Platform access belongs behind the CaptureProvider/HotkeyProvider boundary in apps/desktop/src/main. See design.md D2 and D4.',
            },
            {
              name: 'electron-updater',
              message: 'Auto-update belongs to the Electron main process. See design.md D4.',
            },
          ],
          patterns: [
            {
              group: ['electron/*', 'node:*'],
              message:
                'These packages must stay runtime-agnostic so they can be tested without Electron or Node APIs. See design.md D4.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);

import globals from 'globals';
import js from '@eslint/js';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';

const baseConfig = {
  plugins: {
    '@typescript-eslint': typescriptPlugin,
    react: reactPlugin,
    'react-hooks': reactHooksPlugin,
    'jsx-a11y': jsxA11yPlugin,
  },
  languageOptions: {
    parser: typescriptParser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    ...typescriptPlugin.configs.recommended.rules,
    ...reactPlugin.configs.recommended.rules,
    ...reactHooksPlugin.configs.recommended.rules,
    ...jsxA11yPlugin.configs.recommended.rules,
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'jsx-a11y/anchor-is-valid': 'off',
  },
};

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'src/lib/computer-vision/', 'components/', 'App.tsx', 'index.tsx', 'services/', 'test-cv.js'] },
  js.configs.recommended,
  {
    ...baseConfig,
    files: ['src/**/*.{ts,tsx}', '*.ts'],
    languageOptions: {
      ...baseConfig.languageOptions,
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['src/workers/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['src/test/**/*.{ts,tsx}', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    files: ['*.config.js', '*.config.ts', 'test-cv.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];



// ESLint flat config
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';

export default [
  // Ignore build outputs, vendored assets, and non-web workspaces (mobile, backend virtualenv)
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'backend/**',
      'mobile/**',
      '**/.venv/**',
    ],
  },

  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      // React
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      'react/jsx-uses-vars': 'warn',
      'react/jsx-uses-react': 'off',

      // JS quality
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(React|_)',
          caughtErrors: 'none',
        },
      ],
    },
    settings: { react: { version: 'detect' } },
  },
];

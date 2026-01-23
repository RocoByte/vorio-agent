/**
 * ESLint Configuration for Vorio Agent
 *
 * Uses the new flat config format (ESLint 9+).
 * Configured for TypeScript with strict rules.
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  // Base JavaScript rules
  eslint.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  // Project-specific rules
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',

      // General code quality
      'no-console': 'off', // We use console for logging
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],

      // Code style
      'max-len': [
        'warn',
        {
          code: 100,
          ignoreComments: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
    },
  },

  // Prettier integration (must be last)
  eslintPluginPrettier
);

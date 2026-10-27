import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'reports', 'coverage', 'tmp'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The authoritative simulator must be deterministic: no ambient randomness or wall clock.
      'no-restricted-globals': ['off'],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[object.name='Math'][property.name='random']", message: 'Math.random() is forbidden in the deterministic engine; use the seeded rng.' },
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'Date.now() is forbidden in the deterministic engine.' },
        { selector: "NewExpression[callee.name='Date']", message: 'new Date() is forbidden in the deterministic engine.' },
      ],
    },
  },
);

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'server/data/**', 'server/uploads/**', 'server/logs/**', 'server/backups/**']),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }], 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  { files: ['server/**/*.cjs', 'scripts/**/*.cjs', 'tests/**/*.cjs'], extends: [js.configs.recommended], languageOptions: { sourceType: 'commonjs', globals: globals.node }, rules: { 'no-unused-vars': ['error', { args: 'after-used', ignoreRestSiblings: true }] } },
  { files: ['*.js'], extends: [js.configs.recommended], languageOptions: { globals: globals.node } },
]);

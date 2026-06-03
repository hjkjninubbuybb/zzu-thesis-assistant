import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/*' },
        { type: 'pages', pattern: 'src/pages/*' },
        {
          type: 'feature',
          pattern: 'src/features/([^/]+)/**',
          capture: ['featureName'],
        },
        { type: 'shared', pattern: 'src/shared/*' },
      ],
    },
    rules: {
      // v6: 单一 boundaries/dependencies 规则替代旧的 element-types + entry-point。
      // 选择器统一用 object 形式，capture 变量用 {{ ... }} 模板语法。
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            // app 可以引用 pages / feature / shared
            {
              from: { type: 'app' },
              allow: {
                to: [{ type: 'pages' }, { type: 'feature' }, { type: 'shared' }],
              },
            },
            // pages 可以引用 feature / shared
            {
              from: { type: 'pages' },
              allow: { to: [{ type: 'feature' }, { type: 'shared' }] },
            },
            // feature 可以引用 shared 和同名 feature 内部文件
            {
              from: { type: 'feature' },
              allow: {
                to: [
                  { type: 'shared' },
                  {
                    type: 'feature',
                    captured: {
                      featureName: '{{ from.captured.featureName }}',
                    },
                  },
                ],
              },
            },
            // shared 只能引用 shared
            {
              from: { type: 'shared' },
              allow: { to: { type: 'shared' } },
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
]);

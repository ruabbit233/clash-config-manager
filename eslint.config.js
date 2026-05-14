import js from '@eslint/js'
import ts from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  {
    ignores: ['node_modules', 'dist', '.wrangler', 'admin/dist', 'admin/node_modules'],
  },
  {
    files: ['src/**/*.ts', 'admin/src/**/*.ts', 'admin/vite.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
)

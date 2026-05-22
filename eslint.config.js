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
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-unused-vars': 'off',
    },
  },
)

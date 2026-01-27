/**
 * ESLint override configuration to disable specific TypeScript rules.
 * This configuration is useful for projects that require more strict or lenient type checking.
 * It turns off rules that are too strict for the current phase of development.
 * TODO: Revisit these rules and enable them as the codebase matures.
 * */
export default [
  {
    rules: {
      //
      // Disable rules related to `any` type
      //
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Code Review: Should remove overrides. Requires code changes. for code quality improvement
      //
      // Disable rules that may be too strict for now
      //
      '@typescript-eslint/explicit-function-return-type': 'off', // Code Review: Should be enabled. Requires code changes.
      '@typescript-eslint/explicit-module-boundary-types': 'off', // Code Review: Should be enabled. Requires code changes.
      /**
       * TODO Code Review: Deprecated rule replace with '@typescript-eslint/naming-convention'
       * @see ./typescript-naming-convention.eslint.js
       * */
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
];

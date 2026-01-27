import optionalChainPlugin from './plugins/optional-chaining-autofix.mjs';

export default [
  {
    plugins: {
      'optional-chain': optionalChainPlugin,
    },
    rules: {
      // Turn on the local auto-fixer as WARN (so you can preview), then run --fix
      'optional-chain/optional-chaining-autofix': [
        'warn',
        {
          includeNull: true,
          includeUndefined: true,
          onlySimpleMember: true, // set false to also try obj[expr]
          guardUpdatesAndAssignments: true,
        },
      ],
    },
  },
];

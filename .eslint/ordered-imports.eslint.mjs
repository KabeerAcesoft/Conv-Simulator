import simpleImportSort from 'eslint-plugin-simple-import-sort';

// @description React Ordered imports
// @install npm i eslint-plugin-simple-import-sort --save-dev
export default [
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Packages `node` related packages come first.
            ['^node'],
            // Nest
            ['^@?nestjs'],
            // All other packages.
            ['^@?\\w'],
            // src
            ['^src'],
            // Side effect imports.
            ['^\\u0000'],
            // Parent imports. Put `..` last.
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            // Other relative imports. Put same-folder imports and `.` last.
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
            // Style imports.
            ['^.+\\.?(css)$'],
          ],
        },
      ],
    },
  },
];

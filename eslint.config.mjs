import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import noSecretsEslint from './.eslint/no-secrets.eslint.mjs';
// import optionalChainingEslint from './.eslint/optional-chaining.eslint.mjs';
import orderedImportsEslint from './.eslint/ordered-imports.eslint.mjs';
import overridesEslint from './.eslint/overrides.eslint.mjs';
import perfectionistEslint from './.eslint/perfectionist.eslint.mjs';
import securityEslint from './.eslint/security.eslint.mjs';
import sonarEslint from './.eslint/sonar.eslint.mjs';
import stylisticEslint from './.eslint/stylistic.eslint.mjs';
import unicornEslint from './.eslint/unicorn.eslint.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config([
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...noSecretsEslint,
  ...securityEslint,
  ...sonarEslint,
  eslintPluginPrettierRecommended,
  ...stylisticEslint,
  ...orderedImportsEslint,
  ...perfectionistEslint,
  ...unicornEslint,
  // ...optionalChainingEslint,
  ...overridesEslint,
]);

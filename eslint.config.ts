import eslint from "@eslint/js";
import markdown from "@eslint/markdown";
import jsonc from "eslint-plugin-jsonc";
import tseslint from "typescript-eslint";
import type { ConfigArray } from "typescript-eslint";

export default [
	// Global ignores
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			"docs/**",
			"*.config.js",
			"*.config.mjs",
			"*.config.ts", // Ignore config file to avoid parsing issues
		],
	},

	// Base ESLint recommended rules (only for JS/TS files)
	{
		...eslint.configs.recommended,
		files: ["**/*.ts", "**/*.js", "**/*.mjs", "**/*.cjs"],
	},

	// TypeScript (strict type-aware) - only for src/**/*.ts files
	...tseslint.configs.strictTypeChecked.map((config) => ({
		...config,
		files: ["src/**/*.ts"],
	})),
	...tseslint.configs.stylisticTypeChecked.map((config) => ({
		...config,
		files: ["src/**/*.ts"],
	})),
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["*.config.ts"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Allow underscore-prefixed unused vars (convention for intentionally unused)
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "error",
			// Allow type assertions - needed for dynamic type refinement in the evaluator
			"@typescript-eslint/consistent-type-assertions": "off",
			// Allow case declarations without blocks (common pattern)
			"no-case-declarations": "off",
			// Allow truthy conditionals (often intentional guards)
			"@typescript-eslint/no-unnecessary-condition": "off",
			// Allow number in template literals
			"@typescript-eslint/restrict-template-expressions": [
				"error",
				{ allowNumber: true },
			],
			// Allow string + number (for error messages)
			"@typescript-eslint/restrict-plus-operands": [
				"error",
				{ allowNumberAndString: true },
			],
			// Allow || for default values (nullish coalescing not always better)
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			// Allow non-null assertions (code often validates before use)
			"@typescript-eslint/no-non-null-assertion": "off",
			// Allow empty interfaces (used for documentation/extension)
			"@typescript-eslint/no-empty-object-type": "off",
			// Allow traditional for loops
			"@typescript-eslint/prefer-for-of": "off",
			indent: ["error", "tab"],
			quotes: ["error", "double", { avoidEscape: true }],
		},
	},

	// TypeScript (basic rules without type checking) - for test and examples
	...tseslint.configs.recommended.map((config) => ({
		...config,
		files: ["test/**/*.ts", "examples/**/*.ts"],
	})),
	{
		files: ["test/**/*.ts", "examples/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "off", // Tests often need any
			"no-case-declarations": "off",
			indent: ["error", "tab"],
			quotes: ["error", "double", { avoidEscape: true }],
		},
	},

	// JSON files - explicitly scope to .json files only
	...jsonc.configs["flat/recommended-with-json"].map((config) => ({
		...config,
		files: ["**/*.json"],
	})),
	{
		files: ["**/*.json"],
		rules: {
			"jsonc/sort-keys": "off",
			"jsonc/indent": ["error", 2],
			"jsonc/quotes": ["error", "double"],
		},
	},

	// Markdown - scope to .md files only
	...markdown.configs.recommended.map((config) => ({
		...config,
		files: ["**/*.md"],
	})),
	{
		files: ["**/*.md"],
		rules: {
			// Allow code blocks without language (many are pseudo-code or math notation)
			"markdown/fenced-code-language": "off",
		},
	},
] satisfies ConfigArray;

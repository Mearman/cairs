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
		],
	},

	// Base ESLint recommended rules
	eslint.configs.recommended,

	// TypeScript
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts"],
		rules: {
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/no-explicit-any": "error",
			indent: ["error", "tab"],
			quotes: ["error", "double", { avoidEscape: true }],
		},
	},

	// JSON files
	...jsonc.configs["flat/recommended-with-json"],
	{
		files: ["**/*.json"],
		rules: {
			"jsonc/sort-keys": "off",
			"jsonc/indent": ["error", "tab"],
			"jsonc/quotes": ["error", "double"],
		},
	},

	// Markdown
	...markdown.configs.recommended,
] satisfies ConfigArray;

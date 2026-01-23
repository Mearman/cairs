import eslint from "@eslint/js";
import markdown from "@eslint/markdown";
import jsonc from "eslint-plugin-jsonc";
import tseslint from "typescript-eslint";
import type { Rule } from "eslint";
import type { ConfigArray } from "typescript-eslint";

// Custom rule: enforce test file naming convention
const testFileNamingRule: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce that test files end with .unit.test.ts or .integration.test.ts",
			category: "Best Practices",
			recommended: true,
		},
		messages: {
			invalidTestFileName:
				"Test file must end with .unit.test.ts or .integration.test.ts. Found: '{{actual}}'",
		},
	},
	create(context) {
		const filename = context.filename;

		return {
			Program() {
				// Skip if not a test file
				if (!filename.match(/\.test\.ts$|\.spec\.ts$/)) {
					return;
				}

				// Check if it follows the allowed naming convention
				const validSuffixes = [".unit.test.ts", ".integration.test.ts"];
				const isValid = validSuffixes.some((suffix) => filename.endsWith(suffix));

				if (isValid) {
					return;
				}

				context.report({
					loc: { column: 0, line: 1 },
					messageId: "invalidTestFileName",
					data: { actual: filename },
				});
			},
		};
	},
};

export default [
	// Global ignores
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			"wiki/**",
			"*.config.js",
			"*.config.mjs",
			"*.config.ts", // Ignore config file to avoid parsing issues
		],
	},

	// Test file naming convention - enforce .unit.test.ts or .integration.test.ts
	{
		files: ["**/*.test.ts", "**/*.spec.ts"],
		plugins: {
			cairs: { rules: { "test-file-naming": testFileNamingRule } },
		},
		rules: {
			"cairs/test-file-naming": "error",
		},
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
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/no-explicit-any": "error",
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
			// Forbid non-null assertions (use proper type guards instead)
			"@typescript-eslint/no-non-null-assertion": "error",
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
			"@typescript-eslint/no-unused-vars": "error",
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

	// Markdown - scope to .md files only, but exclude .tmp
	...markdown.configs.recommended.map((config) => ({
		...config,
		files: ["**/*.md"],
		ignores: [".tmp/**/*.md"],
	})),
	{
		files: ["**/*.md"],
		ignores: [".tmp/**/*.md"],
		rules: {
			// Allow code blocks without language (many are pseudo-code or math notation)
			"markdown/fenced-code-language": "off",
		},
	},
] satisfies ConfigArray;

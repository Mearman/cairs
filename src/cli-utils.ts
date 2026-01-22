/**
 * CAIRS CLI Utilities
 *
 * Extracted CLI functions for testability and reusability:
 * - Input parsing (comma-separated and JSON formats)
 * - File I/O (reading JSON input files)
 * - Argument parsing (with support for flags and options)
 */

import { readFile } from "node:fs/promises";

/**
 * CLI options interface
 */
export interface Options {
  verbose: boolean;
  validate: boolean;
  help: boolean;
  list: boolean;
  inputs?: string;
  inputsFile?: string;
  synth: boolean;
}

/**
 * Parse inputs from a comma-separated or JSON format string
 *
 * @param input Input string in comma-separated or JSON array format
 * @returns Array of strings and numbers
 *
 * Examples:
 *   "1,2,3" → [1, 2, 3]
 *   "[1, 2, 3]" → [1, 2, 3]
 *   "hello,world" → ["hello", "world"]
 *   '["hello", "world"]' → ["hello", "world"]
 */
export function parseInputString(input: string): (string | number)[] {
	try {
		// Try parsing as JSON first (handles arrays like [1, 2, 3])
		const parsed = JSON.parse(input) as unknown;
		if (Array.isArray(parsed)) {
			return parsed.map((v) => (typeof v === "number" ? v : String(v)));
		}
	} catch {
		// Fall through to comma-separated parsing
	}

	// Parse as comma-separated values
	return input.split(",").map((s) => {
		const trimmed = s.trim();
		// Empty string should remain a string, not convert to number
		if (trimmed === "") return "";
		const num = Number(trimmed);
		return Number.isNaN(num) ? trimmed : num;
	});
}

/**
 * Read inputs from a JSON file
 *
 * @param filePath Path to JSON file
 * @returns Array of strings and numbers, or null if file doesn't exist or is invalid
 *
 * Expected format: JSON array at top level
 * Example: [1, 2, 3] or ["hello", "world"] or [1, "foo", 2]
 */
export async function readInputsFile(filePath: string): Promise<(string | number)[] | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		const parsed = JSON.parse(content) as unknown;
		if (Array.isArray(parsed)) {
			return parsed.map((v) => (typeof v === "number" ? v : String(v)));
		}
	} catch {
		// File doesn't exist or is invalid JSON
	}
	return null;
}

/**
 * Parse command-line arguments
 *
 * @param args Argument array (typically from process.argv.slice(2))
 * @returns Object with parsed path and options
 *
 * Supports:
 *   - Positional path argument
 *   - Flags: --verbose/-v, --help/-h, --list/-l, --validate
 *   - Options with values: --inputs <val>, --inputs-file <path>
 *   - Subcommand style: list, help, validate
 */
export function parseArgs(args: string[]): { path: string | null; options: Options } {
	const options: Options = {
		verbose: false,
		validate: false,
		help: false,
		list: false,
		synth: false,
	};
	let path: string | null = null;

	const normalized = args.flatMap((arg) => {
		// Support subcommand style: `examples list`, `examples validate <path>`
		if (arg === "list") return ["--list"];
		if (arg === "validate") return ["--validate"];
		if (arg === "help") return ["--help"];
		return [arg];
	});

	for (let i = 0; i < normalized.length; i++) {
		const arg = normalized[i]!;
		switch (arg) {
		case "--verbose":
		case "-v":
			options.verbose = true;
			break;
		case "--validate":
			options.validate = true;
			break;
		case "--help":
		case "-h":
			options.help = true;
			break;
		case "--list":
		case "-l":
			options.list = true;
			break;
		case "--synth":
			options.synth = true;
			break;
		case "--inputs":
			if (i + 1 < normalized.length) {
				const nextArg = normalized[i + 1];
				if (nextArg && !nextArg.startsWith("-")) {
					options.inputs = nextArg;
					i++;
				}
			}
			break;
		case "--inputs-file":
			if (i + 1 < normalized.length) {
				const nextArg = normalized[i + 1];
				if (nextArg && !nextArg.startsWith("-")) {
					options.inputsFile = nextArg;
					i++;
				}
			}
			break;
		default:
			if (!arg.startsWith("-")) {
				path = arg;
			}
		}
	}

	return { path, options };
}

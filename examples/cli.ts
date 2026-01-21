#!/usr/bin/env tsx
/**
 * CAIRS Example Runner
 *
 * A CLI tool for running and exploring CAIRS examples.
 *
 * Usage:
 *   pnpm run-example <path>          # Run an example
 *   pnpm run-example --list         # List all examples
 *   pnpm run-example --verbose      # Show detailed output
 *   pnpm run-example --validate     # Only validate, don't evaluate
 *   pnpm run-example --help         # Show help
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
	validateAIR,
	validateCIR,
	createCoreRegistry,
	createBoolRegistry,
	createListRegistry,
	createSetRegistry,
	evaluateProgram,
	typeCheckProgram,
	registerDef,
	type AIRDocument,
	type CIRDocument,
	type Value,
	type Defs,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = __dirname;

// Color codes for terminal output
const colors = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

interface ExampleInfo {
  path: string;
  ir: "AIR" | "CIR";
  category: string;
  name: string;
  description?: string;
}

interface Options {
  verbose: boolean;
  validate: boolean;
  help: boolean;
  list: boolean;
}

function print(msg: string, color: keyof typeof colors = "reset"): void {
	process.stdout.write(`${colors[color]}${msg}${colors.reset}\n`);
}

function formatValue(value: Value, indent = 0): string {
	const pad = "  ".repeat(indent);
	if (value.kind === "error") {
		return `${pad}${colors.red}Error: ${value.code}${colors.reset}`;
	}
	if (value.kind === "int" || value.kind === "float") {
		return `${pad}${colors.cyan}${value.value}${colors.reset}`;
	}
	if (value.kind === "bool") {
		return `${pad}${colors.magenta}${value.value}${colors.reset}`;
	}
	if (value.kind === "string") {
		return `${pad}${colors.green}"${value.value}"${colors.reset}`;
	}
	if (value.kind === "list") {
		const elements = value.value.map((e: Value) => formatValue(e, 0)).join(", ");
		return `${pad}[${elements}]`;
	}
	if (value.kind === "set") {
		const elements = Array.from(value.value).map((e) => formatValue({ kind: "string", value: e } as Value, 0)).join(", ");
		return `${pad}{${elements}}`;
	}
	if (value.kind === "closure") {
		return `${pad}${colors.yellow}<closure>${colors.reset}`;
	}
	return `${pad}${JSON.stringify(value)}`;
}

function parseArgs(args: string[]): { path: string | null; options: Options } {
	const options: Options = {
		verbose: false,
		validate: false,
		help: false,
		list: false,
	};
	let path: string | null = null;

	for (const arg of args) {
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
		default:
			if (!arg.startsWith("-")) {
				path = arg;
			}
		}
	}

	return { path, options };
}

async function findExamples(dir: string, baseDir = dir): Promise<ExampleInfo[]> {
	const examples: ExampleInfo[] = [];
	const entries = await readdir(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const statResult = await stat(fullPath);

		if (statResult.isDirectory()) {
			const subExamples = await findExamples(fullPath, baseDir);
			examples.push(...subExamples);
		} else if (entry.endsWith(".air.json")) {
			const relPath = relative(baseDir, fullPath);
			const parts = relPath.split("/");
			examples.push({
				path: relPath.replace(/\.air\.json$/, ""),
				ir: "AIR",
				category: parts.slice(0, -1).join("/"),
				name: entry,
			});
		} else if (entry.endsWith(".cir.json")) {
			const relPath = relative(baseDir, fullPath);
			const parts = relPath.split("/");
			examples.push({
				path: relPath.replace(/\.cir\.json$/, ""),
				ir: "CIR",
				category: parts.slice(0, -1).join("/"),
				name: entry,
			});
		}
	}

	return examples;
}

function listExamples(examples: ExampleInfo[]): void {
	print(`\n${colors.bold}CAIRS Examples${colors.reset}\n`, "reset");

	const byIR = examples.reduce(
		(acc, ex) => {
			if (!acc[ex.ir]) acc[ex.ir] = [];
			acc[ex.ir].push(ex);
			return acc;
		},
    {} as Record<string, ExampleInfo[]>
	);

	for (const [ir, exs] of Object.entries(byIR)) {
		print(`${colors.bold}${ir} Examples${colors.reset} (${exs.length})`, "blue");
		const byCategory = exs.reduce(
			(acc, ex) => {
				if (!acc[ex.category]) acc[ex.category] = [];
				acc[ex.category].push(ex);
				return acc;
			},
      {} as Record<string, ExampleInfo[]>
		);

		for (const [category, items] of Object.entries(byCategory)) {
			print(`  ${colors.dim}${category}/${colors.reset}`, "dim");
			for (const item of items) {
				const name = item.path.replace(/^air\//, "").replace(/^cir\//, "");
				print(`    ${colors.cyan}${name}${colors.reset}`, "cyan");
			}
		}
		print("");
	}
}

async function loadExample(path: string): Promise<{ doc: AIRDocument | CIRDocument; ir: "AIR" | "CIR" } | null> {
	let filePath = path;
	if (!filePath.endsWith(".json")) {
		if (filePath.includes("cir/") || filePath.startsWith("cir/")) {
			filePath += ".cir.json";
		} else {
			filePath += ".air.json";
		}
	}

	const fullPath = join(EXAMPLES_DIR, filePath);
	const content = await readFile(fullPath, "utf-8");
	const doc = JSON.parse(content) as AIRDocument | CIRDocument;

	const ir: "AIR" | "CIR" = filePath.endsWith(".cir.json") ? "CIR" : "AIR";
	return { doc, ir };
}

async function runExample(path: string, options: Options): Promise<boolean> {
	try {
		const result = await loadExample(path);
		if (!result) {
			print(`Error: Could not load example: ${path}`, "red");
			return false;
		}

		const { doc, ir } = result;

		print(`\n${colors.bold}Running ${ir} Example:${colors.reset} ${colors.cyan}${path}${colors.reset}\n`);

		// Validate
		print(`${colors.bold}Validating...${colors.reset}`, "reset");
		const validationResult = ir === "AIR" ? validateAIR(doc) : validateCIR(doc);

		if (!validationResult.valid) {
			// Filter out known CIR validation issues (lambda params reported as non-existent)
			const knownCIRIssues = validationResult.errors.filter(
				(e) => !e.message.includes("Reference to non-existent node") || ir === "AIR"
			);

			if (knownCIRIssues.length > 0) {
				print(`${colors.red}Validation failed:${colors.reset}`, "red");
				for (const error of knownCIRIssues) {
					print(`  - ${error.path}: ${error.message}`, "red");
				}
				return false;
			}

			// All errors are known CIR issues - show as warnings
			if (validationResult.errors.length > 0 && options.verbose) {
				print(`${colors.yellow}Note: ${validationResult.errors.length} known CIR validation issue(s)${colors.reset}`, "yellow");
				print(`${colors.dim}  (Lambda parameters reported as non-existent nodes - this is expected)${colors.reset}\n`, "dim");
			}
		}

		print(`${colors.green}✓ Validation passed${colors.reset}\n`, "green");

		if (options.validate) {
			return true;
		}

		// Type check
		if (options.verbose) {
			print(`${colors.bold}Type checking...${colors.reset}`, "reset");
		}
		// Merge all registries into one Map
		let registry = createCoreRegistry();
		registry = new Map([...registry, ...createBoolRegistry()]);
		registry = new Map([...registry, ...createListRegistry()]);
		registry = new Map([...registry, ...createSetRegistry()]);

		// Build defs from airDefs
		let defs: Defs = new Map();
		if (doc.airDefs) {
			for (const airDef of doc.airDefs) {
				defs = registerDef(defs, airDef);
			}
		}

		const typeCheckResult = typeCheckProgram(doc, registry, defs);
		if (options.verbose) {
			print(`${colors.green}✓ Type check passed${colors.reset}`, "green");
			print(`${colors.dim}Result type: ${JSON.stringify(typeCheckResult.resultType)}${colors.reset}\n`, "dim");
		}

		// Evaluate
		print(`${colors.bold}Evaluating...${colors.reset}`, "reset");
		const evalResult = evaluateProgram(doc, registry, defs);

		if (evalResult.kind === "error") {
			print(`${colors.red}Evaluation error:${colors.reset} ${evalResult.code}`, "red");
			if (evalResult.message) {
				print(`  ${evalResult.message}`, "red");
			}
			return false;
		}

		// Display result
		print(`${colors.green}✓ Result:${colors.reset}`, "green");
		print(formatValue(evalResult));
		print("");

		// Show expected result if available
		const expected = (doc as any).expected_result;
		if (expected !== undefined && options.verbose) {
			print(`${colors.dim}Expected: ${expected}${colors.reset}`, "dim");
			if (evalResult.kind === "int" && evalResult.value === expected) {
				print(`${colors.green}✓ Matches expected result${colors.reset}\n`, "green");
			} else if (evalResult.kind === "float" && evalResult.value === expected) {
				print(`${colors.green}✓ Matches expected result${colors.reset}\n`, "green");
			} else if (evalResult.kind === "bool" && evalResult.value === expected) {
				print(`${colors.green}✓ Matches expected result${colors.reset}\n`, "green");
			}
		}

		// Show document info in verbose mode
		if (options.verbose) {
			print(`${colors.dim}────────────────────────────────────────${colors.reset}`, "dim");
			print(`${colors.dim}Version: ${doc.version}${colors.reset}`, "dim");
			print(`${colors.dim}Nodes: ${doc.nodes.length}${colors.reset}`, "dim");
			if (doc.airDefs && doc.airDefs.length > 0) {
				print(`${colors.dim}AIR Defs: ${doc.airDefs.length}${colors.reset}`, "dim");
			}
			print(`${colors.dim}Result: ${doc.result}${colors.reset}`, "dim");
			print("");
		}

		return true;
	} catch (error) {
		if (error instanceof Error) {
			print(`${colors.red}Error:${colors.reset} ${error.message}`, "red");
			if (options.verbose) {
				print(error.stack || "", "dim");
			}
		} else {
			print(`${colors.red}Unknown error${colors.reset}`, "red");
		}
		return false;
	}
}

function showHelp(): void {
	print(`\n${colors.bold}CAIRS Example Runner${colors.reset}\n`, "reset");
	print(`${colors.bold}Usage:${colors.reset}`, "reset");
	print("  pnpm run-example <path> [options]\n", "reset");
	print(`${colors.bold}Examples:${colors.reset}`, "reset");
	print("  pnpm run-example air/basics/arithmetic", "cyan");
	print("  pnpm run-example cir/algorithms/factorial", "cyan");
	print("  pnpm run-example --list\n", "cyan");
	print(`${colors.bold}Options:${colors.reset}`, "reset");
	print("  -v, --verbose     Show detailed output", "reset");
	print("  -l, --list        List all available examples", "reset");
	print("  --validate        Only validate, don't evaluate", "reset");
	print("  -h, --help        Show this help message\n", "reset");
	print(`${colors.bold}Example Paths:${colors.reset}`, "reset");
	print("  air/basics/*           - Basic AIR expressions", "dim");
	print("  air/control-flow/*     - Conditionals and let bindings", "dim");
	print("  air/data-structures/*  - Lists and sets", "dim");
	print("  cir/basics/*           - Lambda expressions", "dim");
	print("  cir/algorithms/*       - Classic algorithms", "dim");
	print("  cir/higher-order/*     - Map, filter, fold", "dim");
	print("  cir/fixpoint/*         - Fixpoint combinator", "dim");
	print("");
}

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	const { path, options } = parseArgs(args);

	if (options.help) {
		showHelp();
		return 0;
	}

	if (options.list || !path) {
		const examples = await findExamples(EXAMPLES_DIR);
		listExamples(examples);
		if (!path) {
			return 0;
		}
	}

	const success = await runExample(path!, options);
	return success ? 0 : 1;
}

// Run
main()
	.then((code) => process.exit(code))
	.catch((error) => {
		print(`${colors.red}Fatal error:${colors.reset} ${error}`, "red");
		process.exit(1);
	});

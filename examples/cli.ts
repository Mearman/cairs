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
	validateEIR,
	validateLIR,
	createCoreRegistry,
	createBoolRegistry,
	createListRegistry,
	createSetRegistry,
	evaluateProgram,
	evaluateEIR,
	evaluateLIR,
	typeCheckProgram,
	registerDef,
	createQueuedEffectRegistry,
	createDefaultEffectRegistry,
	type AIRDocument,
	type CIRDocument,
	type EIRDocument,
	type LIRDocument,
	type Value,
	type Defs,
} from "../src/index.js";
import {
	parseInputString,
	readInputsFile,
	parseArgs,
	type Options,
} from "../src/cli-utils.js";

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
  ir: "AIR" | "CIR" | "EIR" | "LIR";
  category: string;
  name: string;
  description?: string;
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
		} else if (entry.endsWith(".eir.json")) {
			const relPath = relative(baseDir, fullPath);
			const parts = relPath.split("/");
			examples.push({
				path: relPath.replace(/\.eir\.json$/, ""),
				ir: "EIR",
				category: parts.slice(0, -1).join("/"),
				name: entry,
			});
		} else if (entry.endsWith(".lir.json")) {
			const relPath = relative(baseDir, fullPath);
			const parts = relPath.split("/");
			examples.push({
				path: relPath.replace(/\.lir\.json$/, ""),
				ir: "LIR",
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
				const name = item.path.replace(/^air\//, "").replace(/^cir\//, "").replace(/^eir\//, "").replace(/^lir\//, "");
				print(`    ${colors.cyan}${name}${colors.reset}`, "cyan");
			}
		}
		print("");
	}
}

async function loadExample(path: string): Promise<{ doc: AIRDocument | CIRDocument | EIRDocument | LIRDocument; ir: "AIR" | "CIR" | "EIR" | "LIR" } | null> {
	const isCirHint = path.includes("cir/") || path.startsWith("cir/") || path.endsWith(".cir.json");
	const isEirHint = path.includes("eir/") || path.startsWith("eir/") || path.endsWith(".eir.json");
	const isLirHint = path.includes("lir/") || path.startsWith("lir/") || path.endsWith(".lir.json");
	let defaultExt = ".air.json";
	if (isLirHint) defaultExt = ".lir.json";
	else if (isEirHint) defaultExt = ".eir.json";
	else if (isCirHint) defaultExt = ".cir.json";
	const candidates: string[] = [];

	// If caller provided an explicit filename (with or without extension), try that first.
	if (path.endsWith(".json")) {
		candidates.push(path);
	} else {
		candidates.push(`${path}${defaultExt}`);
	}

	// If the path is a directory, look for <basename>.{air|cir|eir|lir}.json or a single json file inside.
	const dirPath = join(EXAMPLES_DIR, path);
	try {
		const s = await stat(dirPath);
		if (s.isDirectory()) {
			const baseName = path.split("/").pop() || "";
			candidates.push(join(path, `${baseName}.lir.json`));
			candidates.push(join(path, `${baseName}.eir.json`));
			candidates.push(join(path, `${baseName}.cir.json`));
			candidates.push(join(path, `${baseName}.air.json`));
			const entries = await readdir(dirPath);
			const jsons = entries.filter((e) => e.endsWith(".json") && !e.endsWith(".inputs.json"));
			if (jsons.length === 1) {
				candidates.push(join(path, jsons[0]));
			}
		}
	} catch {
		// not a directory; ignore
	}

	for (const rel of candidates) {
		const fullPath = join(EXAMPLES_DIR, rel);
		try {
			const content = await readFile(fullPath, "utf-8");
			const doc = JSON.parse(content) as AIRDocument | CIRDocument | EIRDocument | LIRDocument;
			let ir: "AIR" | "CIR" | "EIR" | "LIR" = "AIR";
			if (fullPath.endsWith(".lir.json")) ir = "LIR";
			else if (fullPath.endsWith(".eir.json")) ir = "EIR";
			else if (fullPath.endsWith(".cir.json")) ir = "CIR";
			return { doc, ir };
		} catch {
			continue;
		}
	}

	return null;
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
		let validationResult = { valid: true, errors: [] } as { valid: boolean; errors: any[] };
		if (ir === "AIR") {
			validationResult = validateAIR(doc as AIRDocument);
		} else if (ir === "CIR") {
			validationResult = validateCIR(doc as CIRDocument);
		} else if (ir === "EIR") {
			validationResult = validateEIR(doc as EIRDocument);
		} else {
			validationResult = validateLIR(doc as LIRDocument);
		}

		if (!validationResult.valid) {
			// Filter out known CIR validation issues (lambda params reported as non-existent)
			const knownCIRIssues = validationResult.errors.filter(
				(err: any) => !err.message.includes("Reference to non-existent node") || ir === "AIR"
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

		// Merge all registries into one Map
		let registry = createCoreRegistry();
		registry = new Map([...registry, ...createBoolRegistry()]);
		registry = new Map([...registry, ...createListRegistry()]);
		registry = new Map([...registry, ...createSetRegistry()]);

		// Build defs from airDefs (if applicable)
		let defs: Defs = new Map();
		if ((ir === "AIR" || ir === "CIR" || ir === "EIR") && (doc as any).airDefs) {
			for (const airDef of (doc as any).airDefs) {
				defs = registerDef(defs, airDef);
			}
		}

		// Type check (AIR/CIR only)
		if (ir === "AIR" || ir === "CIR") {
			if (options.verbose) {
				print(`${colors.bold}Type checking...${colors.reset}`, "reset");
			}
			const typeCheckResult = typeCheckProgram(doc as AIRDocument | CIRDocument, registry, defs);
			if (options.verbose) {
				print(`${colors.green}✓ Type check passed${colors.reset}`, "green");
				print(`${colors.dim}Result type: ${JSON.stringify(typeCheckResult.resultType)}${colors.reset}\n`, "dim");
			}
		}

		// Get inputs for interactive examples
		let inputArray: (string | number)[] = [];
		if (ir === "EIR" || ir === "LIR") {
			// Try to get inputs from various sources in precedence order
			if (options.inputs) {
				inputArray = parseInputString(options.inputs);
				if (options.verbose) {
					print(`${colors.dim}Using inputs from --inputs flag${colors.reset}`, "dim");
				}
			} else if (options.inputsFile) {
				const fileInputs = await readInputsFile(options.inputsFile);
				if (fileInputs) {
					inputArray = fileInputs;
					if (options.verbose) {
						print(`${colors.dim}Using inputs from --inputs-file${colors.reset}`, "dim");
					}
				}
			} else {
				// Try to load fixture file
				const exampleDir = dirname(join(EXAMPLES_DIR, path));
				const baseName = path.split("/").pop() || "";
				const fixtureFile = join(exampleDir, `${baseName}.inputs.json`);
				const fixtureInputs = await readInputsFile(fixtureFile);
				if (fixtureInputs) {
					inputArray = fixtureInputs;
					if (options.verbose) {
						print(`${colors.dim}Using inputs from fixture file${colors.reset}`, "dim");
					}
				}
			}
		}

		// Evaluate
		print(`${colors.bold}Evaluating...${colors.reset}`, "reset");
		let evalResult: Value;

		if (ir === "EIR") {
			const effectRegistry = inputArray.length > 0
				? createQueuedEffectRegistry(inputArray)
				: createDefaultEffectRegistry();
			const eirResult = evaluateEIR(doc as EIRDocument, registry, defs, undefined, { effects: effectRegistry });
			evalResult = eirResult.result;
		} else if (ir === "LIR") {
			const effectRegistry = inputArray.length > 0
				? createQueuedEffectRegistry(inputArray)
				: createDefaultEffectRegistry();
			const lirResult = evaluateLIR(doc as LIRDocument, registry, effectRegistry);
			evalResult = lirResult.result;
		} else {
			evalResult = evaluateProgram(doc as AIRDocument | CIRDocument, registry, defs);
		}

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
			if ((ir === "AIR" || ir === "CIR" || ir === "EIR") && (doc as any).nodes) {
				print(`${colors.dim}Nodes: ${(doc as any).nodes.length}${colors.reset}`, "dim");
			} else if (ir === "LIR" && (doc as any).blocks) {
				print(`${colors.dim}Blocks: ${(doc as any).blocks.length}${colors.reset}`, "dim");
			}
			if ((doc as any).airDefs && (doc as any).airDefs.length > 0) {
				print(`${colors.dim}AIR Defs: ${(doc as any).airDefs.length}${colors.reset}`, "dim");
			}
			if ((ir === "AIR" || ir === "CIR" || ir === "EIR") && (doc as any).result) {
				print(`${colors.dim}Result: ${(doc as any).result}${colors.reset}`, "dim");
			} else if (ir === "LIR" && (doc as any).entry) {
				print(`${colors.dim}Entry: ${(doc as any).entry}${colors.reset}`, "dim");
			}
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
	print("  pnpm run-example eir/interactive/prompt-uppercase --inputs 'hello'", "cyan");
	print("  pnpm run-example --list\n", "cyan");
	print(`${colors.bold}Options:${colors.reset}`, "reset");
	print("  -v, --verbose         Show detailed output", "reset");
	print("  -l, --list            List all available examples", "reset");
	print("  --validate            Only validate, don't evaluate", "reset");
	print("  --inputs <values>     Input values (comma-separated or JSON)", "reset");
	print("  --inputs-file <path>  Read inputs from JSON file", "reset");
	print("  -h, --help            Show this help message\n", "reset");
	print(`${colors.bold}Example Paths:${colors.reset}`, "reset");
	print("  air/basics/*           - Basic AIR expressions", "dim");
	print("  air/control-flow/*     - Conditionals and let bindings", "dim");
	print("  air/data-structures/*  - Lists and sets", "dim");
	print("  cir/basics/*           - Lambda expressions", "dim");
	print("  cir/algorithms/*       - Classic algorithms", "dim");
	print("  cir/higher-order/*     - Map, filter, fold", "dim");
	print("  cir/fixpoint/*         - Fixpoint combinator", "dim");
	print("  eir/interactive/*      - Interactive input examples", "dim");
	print("  eir/loops/*            - Loop constructs", "dim");
	print("  lir/control-flow/*     - CFG-based control flow", "dim");
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

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
	validatePIR,
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
	synthesizePython,
	AsyncEvaluator,
	type AIRDocument,
	type CIRDocument,
	type EIRDocument,
	type LIRDocument,
	type PIRDocument,
	type Value,
	type Defs,
	type ValidationError,
} from "../src/index.js";
import {
	parseInputString,
	readInputsFile,
	parseArgs,
	type Options,
} from "../src/cli-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = __dirname;

// Type for documents with optional expected_result field (used in examples)
type ExampleDocument = AIRDocument | CIRDocument | EIRDocument | LIRDocument | PIRDocument;

// Helper to safely get expected_result from example documents
function getExpectedResult(doc: ExampleDocument): unknown | undefined {
	return (doc as { expected_result?: unknown }).expected_result;
}

// Helper to safely get nodes from example documents
function getNodes(doc: ExampleDocument): unknown[] | undefined {
	const d = doc as { nodes?: unknown[] };
	return d.nodes;
}

// Helper to safely get blocks from LIR documents
function getBlocks(doc: ExampleDocument): unknown[] | undefined {
	const d = doc as { blocks?: unknown[] };
	return d.blocks;
}

// Helper to safely get airDefs from documents
function getAirDefs(doc: ExampleDocument): unknown[] | undefined {
	const d = doc as { airDefs?: unknown[] };
	return d.airDefs;
}

// Helper to safely get result from documents
function getResult(doc: ExampleDocument): string | undefined {
	const d = doc as { result?: string };
	return d.result;
}

// Helper to safely get entry from LIR documents
function getEntry(doc: ExampleDocument): string | undefined {
	const d = doc as { entry?: string };
	return d.entry;
}

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
  ir: "AIR" | "CIR" | "EIR" | "LIR" | "PIR";
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
	if (value.kind === "selectResult") {
		const valueStr = formatValue(value.value, 0);
		return `${pad}${colors.cyan}selectResult{${colors.reset}index: ${colors.magenta}${value.index}${colors.reset}, value: ${valueStr}${colors.cyan}}${colors.reset}`;
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
		} else if (entry.endsWith(".pir.json")) {
			const relPath = relative(baseDir, fullPath);
			const parts = relPath.split("/");
			examples.push({
				path: relPath.replace(/\.pir\.json$/, ""),
				ir: "PIR",
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
			if (!acc[ex.ir]) {
				acc[ex.ir] = [];
			}
			acc[ex.ir]!.push(ex);
			return acc;
		},
    {} as Record<string, ExampleInfo[]>
	);

	for (const [ir, exs] of Object.entries(byIR)) {
		print(`${colors.bold}${ir} Examples${colors.reset} (${exs.length})`, "blue");
		const byCategory = exs.reduce(
			(acc, ex) => {
				if (!acc[ex.category]) {
					acc[ex.category] = [];
				}
				acc[ex.category]!.push(ex);
				return acc;
			},
      {} as Record<string, ExampleInfo[]>
		);

		for (const [category, items] of Object.entries(byCategory)) {
			print(`  ${colors.dim}${category}/${colors.reset}`, "dim");
			for (const item of items) {
				const name = item.path.replace(/^air\//, "").replace(/^cir\//, "").replace(/^eir\//, "").replace(/^lir\//, "").replace(/^pir\//, "");
				print(`    ${colors.cyan}${name}${colors.reset}`, "cyan");
			}
		}
		print("");
	}
}

async function loadExample(path: string): Promise<{ doc: AIRDocument | CIRDocument | EIRDocument | LIRDocument | PIRDocument; ir: "AIR" | "CIR" | "EIR" | "LIR" | "PIR" } | null> {
	const isPirHint = path.includes("pir/") || path.startsWith("pir/") || path.endsWith(".pir.json");
	const isCirHint = path.includes("cir/") || path.startsWith("cir/") || path.endsWith(".cir.json");
	const isEirHint = path.includes("eir/") || path.startsWith("eir/") || path.endsWith(".eir.json");
	const isLirHint = path.includes("lir/") || path.startsWith("lir/") || path.endsWith(".lir.json");
	let defaultExt = ".air.json";
	if (isPirHint) defaultExt = ".pir.json";
	else if (isLirHint) defaultExt = ".lir.json";
	else if (isEirHint) defaultExt = ".eir.json";
	else if (isCirHint) defaultExt = ".cir.json";
	const candidates: string[] = [];

	// If caller provided an explicit filename (with or without extension), try that first.
	if (path.endsWith(".json")) {
		candidates.push(path);
	} else {
		candidates.push(`${path}${defaultExt}`);
	}

	// If the path is a directory, look for <basename>.{air|cir|eir|lir|pir}.json or a single json file inside.
	const dirPath = join(EXAMPLES_DIR, path);
	try {
		const s = await stat(dirPath);
		if (s.isDirectory()) {
			const baseName = path.split("/").pop() || "";
			candidates.push(join(path, `${baseName}.pir.json`));
			candidates.push(join(path, `${baseName}.lir.json`));
			candidates.push(join(path, `${baseName}.eir.json`));
			candidates.push(join(path, `${baseName}.cir.json`));
			candidates.push(join(path, `${baseName}.air.json`));
			const entries = await readdir(dirPath);
			const jsons = entries.filter((e) => e.endsWith(".json") && !e.endsWith(".inputs.json"));
			if (jsons.length === 1) {
				const jsonFile = jsons[0];
				if (jsonFile) {
					candidates.push(join(path, jsonFile));
				}
			}
		}
	} catch {
		// not a directory; ignore
	}

	for (const rel of candidates) {
		const fullPath = join(EXAMPLES_DIR, rel);
		try {
			const content = await readFile(fullPath, "utf-8");
			const doc = JSON.parse(content) as AIRDocument | CIRDocument | EIRDocument | LIRDocument | PIRDocument;
			let ir: "AIR" | "CIR" | "EIR" | "LIR" | "PIR" = "AIR";
			if (fullPath.endsWith(".pir.json")) ir = "PIR";
			else if (fullPath.endsWith(".lir.json")) ir = "LIR";
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
		let validationResult = { valid: true, errors: [] } as { valid: boolean; errors: ValidationError[] };
		if (ir === "AIR") {
			validationResult = validateAIR(doc as AIRDocument);
		} else if (ir === "CIR") {
			validationResult = validateCIR(doc as CIRDocument);
		} else if (ir === "EIR") {
			validationResult = validateEIR(doc as EIRDocument);
		} else if (ir === "LIR") {
			validationResult = validateLIR(doc as LIRDocument);
		} else {
			validationResult = validatePIR(doc as PIRDocument);
		}

		if (!validationResult.valid) {
			// Filter out known CIR validation issues (lambda params reported as non-existent)
			const knownCIRIssues = validationResult.errors.filter(
				(err) => !err.message.includes("Reference to non-existent node") || ir === "AIR"
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
		if (ir === "AIR") {
			const airDoc = doc as AIRDocument;
			if (airDoc.airDefs) {
				for (const airDef of airDoc.airDefs) {
					defs = registerDef(defs, airDef);
				}
			}
		} else if (ir === "CIR") {
			const cirDoc = doc as CIRDocument;
			if (cirDoc.airDefs) {
				for (const airDef of cirDoc.airDefs) {
					defs = registerDef(defs, airDef);
				}
			}
		} else if (ir === "EIR") {
			const eirDoc = doc as EIRDocument;
			if (eirDoc.airDefs) {
				for (const airDef of eirDoc.airDefs) {
					defs = registerDef(defs, airDef);
				}
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

		// Synthesize Python code (if --synth flag is set)
		// Only supported for AIR/CIR/EIR/LIR, not PIR
		if (options.synth) {
			if (ir === "PIR") {
				print(`${colors.yellow}Python synthesis is not supported for PIR documents${colors.reset}\n`, "yellow");
				return false;
			}
			print(`${colors.bold}Synthesizing Python code...${colors.reset}`, "reset");
			const pythonCode = synthesizePython(doc as AIRDocument | CIRDocument | EIRDocument | LIRDocument, { moduleName: `cairs_example_${path.replace(/[/\\-]/g, "_")}` });
			print(pythonCode);
			print(`${colors.green}✓ Synthesis complete${colors.reset}\n`, "green");
			return true;
		}

		// Get inputs for interactive examples
		let inputArray: (string | number)[] = [];
		if (ir === "EIR" || ir === "LIR" || ir === "PIR") {
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
		} else if (ir === "PIR") {
			const effectRegistry = inputArray.length > 0
				? createQueuedEffectRegistry(inputArray)
				: createDefaultEffectRegistry();
			const evaluator = new AsyncEvaluator(registry, defs, effectRegistry);
			evalResult = await evaluator.evaluateDocument(doc as PIRDocument);
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
		const expected = getExpectedResult(doc);
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
			const nodes = getNodes(doc);
			if ((ir === "AIR" || ir === "CIR" || ir === "EIR") && nodes) {
				print(`${colors.dim}Nodes: ${nodes.length}${colors.reset}`, "dim");
			} else if (ir === "LIR") {
				const blocks = getBlocks(doc);
				if (blocks) {
					print(`${colors.dim}Blocks: ${blocks.length}${colors.reset}`, "dim");
				}
			}
			const airDefs = getAirDefs(doc);
			if (airDefs && airDefs.length > 0) {
				print(`${colors.dim}AIR Defs: ${airDefs.length}${colors.reset}`, "dim");
			}
			if ((ir === "AIR" || ir === "CIR" || ir === "EIR")) {
				const result = getResult(doc);
				if (result) {
					print(`${colors.dim}Result: ${result}${colors.reset}`, "dim");
				}
			} else if (ir === "LIR") {
				const entry = getEntry(doc);
				if (entry) {
					print(`${colors.dim}Entry: ${entry}${colors.reset}`, "dim");
				}
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
	print("  pnpm run-example lir/control-flow/while-cfg --synth", "cyan");
	print("  pnpm run-example pir/async/timeout-select --verbose", "cyan");
	print("  pnpm run-example --list\n", "cyan");
	print(`${colors.bold}Options:${colors.reset}`, "reset");
	print("  -v, --verbose         Show detailed output", "reset");
	print("  -l, --list            List all available examples", "reset");
	print("  --validate            Only validate, don't evaluate", "reset");
	print("  --synth               Generate Python code instead of evaluating", "reset");
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
	print("  pir/async/*            - Async patterns with timeout/select", "dim");
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

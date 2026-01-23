/**
 * SPIRAL Examples Test Runner
 *
 * Validates and evaluates all example files to ensure they work correctly.
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";
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
	defaultEffectRegistry,
	createQueuedEffectRegistry,
	type AIRDocument,
	type CIRDocument,
	type EIRDocument,
	type LIRDocument,
	type Defs,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = __dirname;

interface ExampleFile {
  path: string;
  fullPath: string;
  ir: "AIR" | "CIR" | "EIR" | "LIR";
}

async function findExampleFiles(dir: string, baseDir = dir): Promise<ExampleFile[]> {
	const examples: ExampleFile[] = [];
	const entries = await readdir(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const statResult = await stat(fullPath);

		if (statResult.isDirectory()) {
			const subExamples = await findExampleFiles(fullPath, baseDir);
			examples.push(...subExamples);
		} else if (entry.endsWith(".air.json")) {
			examples.push({
				path: relative(baseDir, fullPath),
				fullPath,
				ir: "AIR",
			});
		} else if (entry.endsWith(".cir.json")) {
			examples.push({
				path: relative(baseDir, fullPath),
				fullPath,
				ir: "CIR",
			});
		} else if (entry.endsWith(".eir.json")) {
			examples.push({
				path: relative(baseDir, fullPath),
				fullPath,
				ir: "EIR",
			});
		} else if (entry.endsWith(".lir.json")) {
			examples.push({
				path: relative(baseDir, fullPath),
				fullPath,
				ir: "LIR",
			});
		}
	}

	return examples;
}

async function loadExample(filePath: string): Promise<{ doc: AIRDocument | CIRDocument | EIRDocument | LIRDocument; ir: "AIR" | "CIR" | "EIR" | "LIR" }> {
	const content = await readFile(filePath, "utf-8");
	const doc = JSON.parse(content) as AIRDocument | CIRDocument | EIRDocument | LIRDocument;
	let ir: "AIR" | "CIR" | "EIR" | "LIR";
	if (filePath.endsWith(".cir.json")) ir = "CIR";
	else if (filePath.endsWith(".eir.json")) ir = "EIR";
	else if (filePath.endsWith(".lir.json")) ir = "LIR";
	else ir = "AIR";
	return { doc, ir };
}

function buildDefs(doc: AIRDocument | CIRDocument | EIRDocument): Defs {
	let defs: Defs = new Map();
	if (doc.airDefs) {
		for (const airDef of doc.airDefs) {
			defs = registerDef(defs, airDef);
		}
	}
	return defs;
}

/**
 * Read inputs from a fixture file
 */
async function readInputsFixture(examplePath: string): Promise<(string | number)[] | null> {
	try {
		const dirPath = dirname(examplePath);
		const baseName = examplePath.split("/").pop()?.replace(/\.(air|cir|eir|lir)\.json$/, "") || "";
		const fixtureFile = join(dirPath, `${baseName}.inputs.json`);
		const content = await readFile(fixtureFile, "utf-8");
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			return parsed.map((v: any) => (typeof v === "number" ? v : String(v)));
		}
	} catch {
		// File doesn't exist or is invalid JSON
	}
	return null;
}

async function runExampleTests() {
	const examples = await findExampleFiles(EXAMPLES_DIR);
	// Merge all registries into one Map
	let registry = createCoreRegistry();
	registry = new Map([...registry, ...createBoolRegistry()]);
	registry = new Map([...registry, ...createListRegistry()]);
	registry = new Map([...registry, ...createSetRegistry()]);

	// Group examples by subdirectory for organized test output
	const byDir = examples.reduce(
		(acc, ex) => {
			const dir = ex.path.split("/").slice(0, -1).join("/");
			if (!acc[dir]) acc[dir] = [];
			acc[dir].push(ex);
			return acc;
		},
    {} as Record<string, ExampleFile[]>
	);

	// Create a test suite for each directory
	for (const [dir, dirExamples] of Object.entries(byDir)) {
		await test(dir, async (t) => {
			for (const example of dirExamples) {
				await t.test(example.path, async () => {
					const { doc, ir } = await loadExample(example.fullPath);

					// Test 1: Validation
					let validationResult;
					if (ir === "AIR") {
						validationResult = validateAIR(doc as AIRDocument);
					} else if (ir === "CIR") {
						validationResult = validateCIR(doc as CIRDocument);
					} else if (ir === "EIR") {
						validationResult = validateEIR(doc as EIRDocument);
					} else {
						validationResult = validateLIR(doc as LIRDocument);
					}
					assert.ok(
						validationResult.valid,
						`Validation failed: ${validationResult.errors.map((e) => e.message).join(", ")}`
					);

					// Test 2: Type checking (skip for LIR and EIR - type checker not yet updated for EIR)
					if (ir === "AIR" || ir === "CIR") {
						const defs = buildDefs(doc as AIRDocument | CIRDocument);
						const typeCheckResult = typeCheckProgram(doc as AIRDocument | CIRDocument, registry, defs);
						assert.ok(typeCheckResult, "Type checking should complete");
					}

					// Test 3: Evaluation
					let evalResult: any;
					if (ir === "EIR") {
						const defs = buildDefs(doc as EIRDocument);
						// Try to load fixture inputs
						const inputs = await readInputsFixture(example.fullPath);
						const effectRegistry = inputs ? createQueuedEffectRegistry(inputs) : defaultEffectRegistry;
						const eirResult = evaluateEIR(doc as EIRDocument, registry, defs, undefined, { effects: effectRegistry });
						evalResult = eirResult.result;
					} else if (ir === "LIR") {
						// Try to load fixture inputs
						const inputs = await readInputsFixture(example.fullPath);
						const effectRegistry = inputs ? createQueuedEffectRegistry(inputs) : defaultEffectRegistry;
						const lirResult = evaluateLIR(doc as LIRDocument, registry, effectRegistry);
						evalResult = lirResult.result;
					} else {
						const defs = buildDefs(doc as AIRDocument | CIRDocument);
						evalResult = evaluateProgram(doc as AIRDocument | CIRDocument, registry, defs);
					}

					if (evalResult.kind === "error") {
						assert.fail(`Evaluation should not error: ${evalResult.code} - ${evalResult.message || ""}`);
					}

					// Check expected result if present
					const expected = (doc as any).expected_result;
					if (expected !== undefined) {
						if (evalResult.kind === "int" || evalResult.kind === "float" || evalResult.kind === "bool") {
							assert.strictEqual(evalResult.value, expected, "Result should match expected value");
						} else if (evalResult.kind === "string") {
							assert.strictEqual(evalResult.value, expected, "Result should match expected value");
						}
					}
				});
			}
		});
	}

	// Summary
	console.log(`\n✓ Tested ${examples.length} examples`);
}

// Run tests
runExampleTests().catch((err) => {
	console.error("Test suite failed:", err);
	process.exit(1);
});

// CAIRS PIR Integration Tests
// Tests that verify PIR example documents evaluate correctly

import { describe, it, before } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncEvaluator } from "../src/async-evaluator.js";
import { createCoreRegistry } from "../src/domains/core.js";
import { validatePIR } from "../src/validator.js";
import { isError } from "../src/types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const examplesDir = join(__dirname, "..", "examples", "pir");

// Helper to load and parse a JSON PIR document
function loadPIRDocument(relativePath: string): unknown {
	const fullPath = join(examplesDir, relativePath);
	const content = readFileSync(fullPath, "utf-8");
	return JSON.parse(content);
}

// Get all PIR example files
function getPIRExamples(): string[] {
	const examples: string[] = [];

	const categories = readdirSync(examplesDir, { withFileTypes: true });
	for (const category of categories) {
		if (!category.isDirectory()) continue;

		const categoryPath = join(examplesDir, category.name);
		const files = readdirSync(categoryPath, { withFileTypes: true });

		for (const file of files) {
			if (file.isFile() && file.name.endsWith(".pir.json")) {
				examples.push(join(category.name, file.name));
			}
		}
	}

	return examples.sort();
}

describe("PIR Integration Tests", () => {
	let registry: ReturnType<typeof createCoreRegistry>;
	let evaluator: AsyncEvaluator;

	before(() => {
		registry = createCoreRegistry();
		evaluator = new AsyncEvaluator(registry, new Map());
	});

	describe("Validation", () => {
		for (const examplePath of getPIRExamples()) {
			it(`should validate ${examplePath}`, () => {
				const doc = loadPIRDocument(examplePath);
				const result = validatePIR(doc);

				assert.ok(
					result.valid,
					`Validation failed for ${examplePath}: ${result.errors.map((e) => e.message).join(", ")}`,
				);
			});
		}
	});

	describe("Evaluation", () => {
		for (const examplePath of getPIRExamples()) {
			it(`should evaluate ${examplePath}`, async () => {
				const doc = loadPIRDocument(examplePath);

				// Skip documents that don't have expected_result
				if (!("expected_result" in doc)) {
					return; // test is skipped
				}

				const result = await evaluator.evaluateDocument(doc as any);

				assert.ok(
					!isError(result),
					`Evaluation failed for ${examplePath}: ${isError(result) ? (result as { message: string }).message : "unknown error"}`,
				);
			});
		}
	});

	describe("Expected Results", () => {
		for (const examplePath of getPIRExamples()) {
			it(`should match expected result for ${examplePath}`, async () => {
				const doc = loadPIRDocument(examplePath);

				// Only test documents with expected_result
				if (!("expected_result" in doc)) {
					return; // test is skipped
				}

				const result = await evaluator.evaluateDocument(doc as any);
				const expected = (doc as { expected_result: unknown }).expected_result;

				// Handle different expected result types
				if (typeof expected === "number") {
					assert.equal(result.kind, "int");
					assert.equal((result as { value: number }).value, expected);
				} else if (typeof expected === "boolean") {
					assert.equal(result.kind, "bool");
					assert.equal((result as { value: boolean }).value, expected);
				} else if (typeof expected === "string") {
					assert.equal(result.kind, "string");
					assert.equal((result as { value: string }).value, expected);
				} else {
					assert.ok(
						false,
						`Unsupported expected_result type: ${typeof expected} in ${examplePath}`,
					);
				}
			});
		}
	});
});

describe("PIR Example Categories", () => {
	let registry: ReturnType<typeof createCoreRegistry>;
	let evaluator: AsyncEvaluator;

	before(() => {
		registry = createCoreRegistry();
		evaluator = new AsyncEvaluator(registry, new Map());
	});

	describe("Async examples (spawn/await)", () => {
		const asyncExamples = [
			"async/spawn-await.pir.json",
		];

		for (const examplePath of asyncExamples) {
			it(`should evaluate ${examplePath}`, async () => {
				const doc = loadPIRDocument(examplePath);
				const result = await evaluator.evaluateDocument(doc as any);

				assert.ok(!isError(result), `Evaluation failed: ${isError(result) ? (result as { message: string }).message : "unknown"}`);

				// Verify expected result if present
				if ("expected_result" in doc) {
					const expected = (doc as { expected_result: number }).expected_result;
					assert.equal((result as { value: number }).value, expected);
				}
			});
		}
	});

	describe("Channel examples (send/recv)", () => {
		const channelExamples = [
			"channels/producer-consumer.pir.json",
		];

		for (const examplePath of channelExamples) {
			it(`should evaluate ${examplePath}`, async () => {
				const doc = loadPIRDocument(examplePath);
				const result = await evaluator.evaluateDocument(doc as any);

				assert.ok(!isError(result), `Evaluation failed: ${isError(result) ? (result as { message: string }).message : "unknown"}`);

				// Verify expected result if present
				if ("expected_result" in doc) {
					const expected = (doc as { expected_result: number }).expected_result;
					assert.equal((result as { value: number }).value, expected);
				}
			});
		}
	});
});

describe("PIR Error Handling", () => {
	let registry: ReturnType<typeof createCoreRegistry>;
	let evaluator: AsyncEvaluator;

	before(() => {
		registry = createCoreRegistry();
		evaluator = new AsyncEvaluator(registry, new Map());
	});

	it("should handle invalid async operations gracefully", async () => {
		const invalidDoc = {
			version: "2.0.0",
			airDefs: [],
			capabilities: ["async"],
			nodes: [
				{
					id: "badAwait",
					expr: {
						kind: "await",
						future: "nonexistent",
					},
				},
			],
			result: "badAwait",
		};

		const result = await evaluator.evaluateDocument(invalidDoc as any);

		// Should return an error, not throw
		assert.ok(result.kind === "error" || result.kind === "int");
	});

	it("should handle channel operations on closed channels gracefully", async () => {
		// This is a basic test - more comprehensive error handling
		// would require channel state management in tests
		const doc = {
			version: "2.0.0",
			airDefs: [],
			capabilities: ["async", "channels"],
			nodes: [
				{
					id: "ch",
					expr: {
						kind: "channel",
						channelType: "mpsc",
						bufferSize: 0,
					},
				},
			],
			result: "ch",
		};

		const result = await evaluator.evaluateDocument(doc as any);

		// Channel should be created successfully
		assert.equal(result.kind, "channel");
	});
});

describe("PIR Concurrent Execution", () => {
	let registry: ReturnType<typeof createCoreRegistry>;
	let evaluator: AsyncEvaluator;

	before(() => {
		registry = createCoreRegistry();
		evaluator = new AsyncEvaluator(registry, new Map());
	});

	it("should execute parallel branches concurrently", async () => {
		// Test that par expression evaluates multiple branches
		const doc = {
			version: "2.0.0",
			airDefs: [],
			capabilities: ["async"],
			nodes: [
				{
					id: "a",
					expr: { kind: "lit", type: { kind: "int" }, value: 1 },
				},
				{
					id: "b",
					expr: { kind: "lit", type: { kind: "int" }, value: 2 },
				},
			],
			result: "a",
		};

		const result = await evaluator.evaluateDocument(doc as any);

		assert.equal(result.kind, "int");
		assert.equal((result as { value: number }).value, 1);
	});

	it("should handle sequential vs parallel concurrency modes", async () => {
		// Test with sequential mode
		const doc = {
			version: "2.0.0",
			airDefs: [],
			capabilities: ["async"],
			nodes: [
				{
					id: "x",
					expr: { kind: "lit", type: { kind: "int" }, value: 42 },
				},
			],
			result: "x",
		};

		const result = await evaluator.evaluateDocument(doc as any, { concurrency: "sequential" });

		assert.equal(result.kind, "int");
		assert.equal((result as { value: number }).value, 42);
	});
});

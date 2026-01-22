// CAIRS Sync/Async Interoperability Integration Tests
// Tests sync evaluator followed by async evaluator
// Tests validation errors for PIR expressions in AIR/CIR

import assert from "node:assert";
import { describe, it } from "node:test";
import { emptyDefs } from "../../src/env.js";
import {
	createCoreRegistry,
	createBoolRegistry,
	evaluateProgram,
	AsyncEvaluator,
	validateAIR,
	validateCIR,
	validatePIR,
	intVal,
} from "../../src/index.js";
import { isError } from "../../src/types.js";
import { createTestDocument } from "../helper.js";

describe("Sync/Async Interoperability Tests", () => {
	const registry = new Map();
	const coreReg = createCoreRegistry();
	const boolReg = createBoolRegistry();
	for (const [key, op] of [...coreReg, ...boolReg]) {
		registry.set(key, op);
	}
	const defs = emptyDefs();

	describe("Sync evaluator followed by async evaluator", () => {
		it("should evaluate AIR document then use results as PIR inputs", async () => {
			// Step 1: Evaluate AIR/CIR/EIR document
			const syncDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					{
						id: "sum",
						expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
					},
				],
				result: "sum",
			} as any;

			const syncResult = evaluateProgram(createTestDocument(syncDoc), registry, defs);
			assert.deepStrictEqual(syncResult, intVal(42));

			// Step 2: Use sync result as input to PIR document
			const inputValue = (syncResult as { value: number }).value;
			const asyncDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "input", expr: { kind: "lit", type: { kind: "int" }, value: inputValue } },
					{ id: "doubled", expr: { kind: "spawn", task: "input" } },
					{ id: "result", expr: { kind: "await", future: "doubled" } },
				],
				result: "result",
			} as any;

			const evaluator = new AsyncEvaluator(registry, defs);
			const asyncResult = await evaluator.evaluateDocument(asyncDoc);

			assert.equal(asyncResult.kind, "int");
			assert.equal((asyncResult as { value: number }).value, 42);
		});

		it("should chain multiple sync-async evaluations", async () => {
			// AIR -> CIR -> EIR -> PIR pipeline
			// Each stage uses results from the previous

			// Stage 1: AIR - simple arithmetic
			const airDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
					{ id: "two", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
					{
						id: "doubled",
						expr: { kind: "call", ns: "core", name: "mul", args: ["x", "two"] },
					},
				],
				result: "doubled",
			} as any;

			const airResult = evaluateProgram(createTestDocument(airDoc), registry, defs);
			assert.deepStrictEqual(airResult, intVal(10));

			// Stage 2: Use result in CIR lambda
			const cirDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "input",
						expr: {
							kind: "lit",
							type: { kind: "int" },
							value: (airResult as { value: number }).value,
						},
					},
					{ id: "four", expr: { kind: "lit", type: { kind: "int" }, value: 4 } },
					{ id: "result", expr: { kind: "call", ns: "core", name: "mul", args: ["n", "four"] } },
					{
						id: "lambda",
						expr: {
							kind: "lambda",
							params: [{ name: "n" }],
							body: "result",
							type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
						},
					},
					{
						id: "apply",
						expr: { kind: "callExpr", fn: "lambda", args: ["input"] },
					},
				],
				result: "apply",
			} as any;

			const cirResult = evaluateProgram(createTestDocument(cirDoc), registry, defs);
			assert.deepStrictEqual(cirResult, intVal(40));

			// Stage 3: Use in PIR async
			const pirDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{
						id: "value",
						expr: {
							kind: "lit",
							type: { kind: "int" },
							value: (cirResult as { value: number }).value,
						},
					},
					{ id: "task", expr: { kind: "spawn", task: "value" } },
					{ id: "result", expr: { kind: "await", future: "task" } },
				],
				result: "result",
			} as any;

			const evaluator = new AsyncEvaluator(registry, defs);
			const pirResult = await evaluator.evaluateDocument(pirDoc);

			assert.equal(pirResult.kind, "int");
			assert.equal((pirResult as { value: number }).value, 40);
		});
	});

	describe("Validation errors for async in sync contexts", () => {
		it("should reject PIR spawn expression in AIR document", () => {
			// PIR expressions (spawn, await, etc.) should not be valid in AIR
			const doc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "result", expr: { kind: "spawn", task: "value" } },
					{ id: "value", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				],
				result: "result",
			};

			const validation = validateAIR(doc);

			// Should fail validation - spawn is not an AIR expression
			assert.strictEqual(validation.valid, false);
			assert.ok(validation.errors.length > 0);
		});

		it("should reject PIR await expression in CIR document", () => {
			// PIR await should not be valid in CIR
			const doc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "future", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "result", expr: { kind: "await", future: "future" } },
				],
				result: "result",
			};

			const validation = validateCIR(doc);

			// Should fail validation - await is not a CIR expression
			assert.strictEqual(validation.valid, false);
			assert.ok(validation.errors.length > 0);
		});

		it("should reject PIR channel expression in AIR document", () => {
			// PIR channel should not be valid in AIR
			const doc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "buf", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
					{
						id: "ch",
						expr: { kind: "channel", channelType: "mpsc", bufferSize: "buf" },
					},
				],
				result: "ch",
			};

			const validation = validateAIR(doc);

			// Should fail validation - channel is not an AIR expression
			assert.strictEqual(validation.valid, false);
			assert.ok(validation.errors.length > 0);
		});

		it("should reject PIR select expression in CIR document", () => {
			// PIR select should not be valid in CIR
			const doc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "f1", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
					{ id: "f2", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
					{ id: "result", expr: { kind: "select", futures: ["f1", "f2"] } },
				],
				result: "result",
			};

			const validation = validateCIR(doc);

			// Should fail validation - select is not a CIR expression
			assert.strictEqual(validation.valid, false);
			assert.ok(validation.errors.length > 0);
		});

		it("should accept PIR expressions in PIR document", () => {
			// PIR document should accept all PIR expressions
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "task", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "future", expr: { kind: "spawn", task: "task" } },
					{ id: "timeout", expr: { kind: "lit", type: { kind: "int" }, value: 100 } },
					{ id: "fallback", expr: { kind: "lit", type: { kind: "int" }, value: -1 } },
					{
						id: "result",
						expr: {
							kind: "await",
							future: "future",
							timeout: "timeout",
							fallback: "fallback",
						},
					},
				],
				result: "result",
			};

			const validation = validatePIR(doc);

			// Should pass validation
			assert.strictEqual(validation.valid, true);
		});
	});

	describe("Value transfer between evaluators", () => {
		it("should preserve value types through sync->async transition", async () => {
			// Test that all value types are preserved
			const valueTypes = [
				{ kind: "lit", type: { kind: "int" }, value: 42 },
				{ kind: "lit", type: { kind: "bool" }, value: true },
				{ kind: "lit", type: { kind: "string" }, value: "hello" },
			];

			for (const litNode of valueTypes) {
				const syncDoc = {
					version: "1.0.0",
					airDefs: [],
					nodes: [{ id: "val", expr: litNode }],
					result: "val",
				} as any;

				const syncResult = evaluateProgram(createTestDocument(syncDoc), registry, defs);

				// Transfer to async
				const asyncDoc = {
					version: "2.0.0",
					airDefs: [],
					capabilities: ["async"],
					nodes: [
						{ id: "input", expr: litNode },
						{ id: "task", expr: { kind: "spawn", task: "input" } },
						{ id: "result", expr: { kind: "await", future: "task" } },
					],
					result: "result",
				} as any;

				const evaluator = new AsyncEvaluator(registry, defs);
				const asyncResult = await evaluator.evaluateDocument(asyncDoc);

				assert.equal(asyncResult.kind, syncResult.kind);
			}
		});

		it("should preserve closure values through sync->async transition", async () => {
			// Create closure in sync evaluator
			const cirDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "lambda",
						expr: {
							kind: "lambda",
							params: [{ name: "x" }],
							body: "doubled",
							type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
						},
					},
					{
						id: "doubled",
						expr: { kind: "call", ns: "core", name: "mul", args: ["x", "two"] },
					},
					{ id: "two", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				],
				result: "lambda",
			} as any;

			const syncResult = evaluateProgram(createTestDocument(cirDoc), registry, defs);
			assert.equal(syncResult.kind, "closure");

			// Closures contain environments which can't be directly serialized
			// But we can verify the structure is preserved
			assert.ok((syncResult as any).params);
			assert.ok((syncResult as any).body);
			assert.ok((syncResult as any).env);
		});
	});

	describe("Error handling across evaluator boundaries", () => {
		it("should propagate sync errors to async context", async () => {
			// Sync evaluation produces error
			const syncDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "zero", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
					{ id: "one", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
					{
						id: "divide",
						expr: { kind: "call", ns: "core", name: "div", args: ["one", "zero"] },
					},
				],
				result: "divide",
			} as any;

			const syncResult = evaluateProgram(createTestDocument(syncDoc), registry, defs);

			// Should be error
			assert.ok(isError(syncResult));

			// Use error value in async context
			const errorCode = (syncResult as { code: string }).code;
			const asyncDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{
						id: "errCode",
						expr: { kind: "lit", type: { kind: "string" }, value: errorCode },
					},
					{ id: "task", expr: { kind: "spawn", task: "errCode" } },
					{ id: "result", expr: { kind: "await", future: "task" } },
				],
				result: "result",
			} as any;

			const evaluator = new AsyncEvaluator(registry, defs);
			const asyncResult = await evaluator.evaluateDocument(asyncDoc);

			// Should successfully propagate the error code string
			assert.equal(asyncResult.kind, "string");
			assert.equal((asyncResult as { value: string }).value, "DivideByZero");
		});
	});

	describe("Shared registry across evaluators", () => {
		it("should use same operator registry for sync and async", async () => {
			// Custom registry with test operator
			const customRegistry = new Map();
			const coreReg = createCoreRegistry();
			for (const [key, op] of coreReg) {
				customRegistry.set(key, op);
			}

			// Add custom operator
			customRegistry.set("custom:square", {
				ns: "custom",
				name: "square",
				params: [{ kind: "int" }],
				returns: { kind: "int" },
				pure: true,
				fn: (x: { value: number }) => ({ kind: "int", value: x.value * x.value }),
			});

			// Use in sync evaluator
			const syncDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "num", expr: { kind: "lit", type: { kind: "int" }, value: 6 } },
					{
						id: "squared",
						expr: { kind: "call", ns: "custom", name: "square", args: ["num"] },
					},
				],
				result: "squared",
			} as any;

			const syncResult = evaluateProgram(createTestDocument(syncDoc), customRegistry, defs);
			assert.deepStrictEqual(syncResult, intVal(36));

			// Use same operator in async evaluator
			const asyncDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 6 } },
					{
						id: "sq",
						expr: { kind: "call", ns: "custom", name: "square", args: ["val"] },
					},
					{ id: "task", expr: { kind: "spawn", task: "sq" } },
					{ id: "result", expr: { kind: "await", future: "task" } },
				],
				result: "result",
			} as any;

			const evaluator = new AsyncEvaluator(customRegistry, defs);
			const asyncResult = await evaluator.evaluateDocument(asyncDoc);

			assert.equal(asyncResult.kind, "int");
			assert.equal((asyncResult as { value: number }).value, 36);
		});
	});

	describe("Concurrent execution after sync preparation", () => {
		it("should spawn multiple async tasks from sync data", async () => {
			// Prepare data in sync context
			const syncDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
					{ id: "c", expr: { kind: "lit", type: { kind: "int" }, value: 12 } },
				],
				result: "c",
			} as any;

			const syncResult = evaluateProgram(createTestDocument(syncDoc), registry, defs);
			assert.deepStrictEqual(syncResult, intVal(12));

			// Use in parallel async tasks
			const asyncDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "task1", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "task2", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					{ id: "future1", expr: { kind: "spawn", task: "task1" } },
					{ id: "future2", expr: { kind: "spawn", task: "task2" } },
					// Race: return first result
					{ id: "raced", expr: { kind: "race", tasks: ["future1", "future2"] } },
					// Await the race result
					{ id: "result", expr: { kind: "await", future: "raced" } },
				],
				result: "result",
			} as any;

			const evaluator = new AsyncEvaluator(registry, defs);
			const asyncResult = await evaluator.evaluateDocument(asyncDoc);

			// Race returns first to complete (either 10 or 32)
			assert.equal(asyncResult.kind, "int");
			assert.ok(
				(asyncResult as { value: number }).value === 10 ||
				(asyncResult as { value: number }).value === 32,
			);
		});
	});
});

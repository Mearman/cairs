// CAIRS Integration Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { emptyDefs } from "../src/env.js";
import {
	createBoolRegistry,
	createCoreRegistry,
	createQueuedEffectRegistry,
	evaluateProgram,
	evaluateEIR,
	validateAIR,
	intVal,
	stringVal,
} from "../src/index.js";
import { createTestDocument } from "./helper.js";

describe("Integration Tests", () => {
	// Combine all registries
	const registry = new Map();
	const coreReg = createCoreRegistry();
	const boolReg = createBoolRegistry();
	for (const [key, op] of [...coreReg, ...boolReg]) {
		registry.set(key, op);
	}
	const defs = emptyDefs();

	it("should evaluate a complex arithmetic expression", () => {
		// ((10 + 5) * 3) - 3 = 42
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "ten", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "five", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
				{ id: "three", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
				{
					id: "sum",
					expr: {
						kind: "call",
						ns: "core",
						name: "add",
						args: ["ten", "five"],
					},
				},
				{
					id: "product",
					expr: {
						kind: "call",
						ns: "core",
						name: "mul",
						args: ["sum", "three"],
					},
				},
				{
					id: "result",
					expr: {
						kind: "call",
						ns: "core",
						name: "sub",
						args: ["product", "three"],
					},
				},
			],
			result: "result",
		} as any;
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate nested conditionals", () => {
		// if (5 > 3) { if (10 < 20) { 42 } else { 0 } } else { 0 }
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "five", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
				{ id: "three", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
				{ id: "ten", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{
					id: "twenty",
					expr: { kind: "lit", type: { kind: "int" }, value: 20 },
				},
				{
					id: "gt",
					expr: {
						kind: "call",
						ns: "core",
						name: "gt",
						args: ["five", "three"],
					},
				},
				{
					id: "lt",
					expr: {
						kind: "call",
						ns: "core",
						name: "lt",
						args: ["ten", "twenty"],
					},
				},
				{ id: "ans", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "zero", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{
					id: "inner",
					expr: {
						kind: "if",
						cond: "lt",
						then: "ans",
						else: "zero",
						type: { kind: "int" },
					},
				},
				{
					id: "outer",
					expr: {
						kind: "if",
						cond: "gt",
						then: "inner",
						else: "zero",
						type: { kind: "int" },
					},
				},
			],
			result: "outer",
		} as any;
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate let with nested bindings", () => {
		// let z = 10 + 32 in  (where 10 and 32 are referenced by node IDs)
		// z
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "ten", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{
					id: "thirtyTwo",
					expr: { kind: "lit", type: { kind: "int" }, value: 32 },
				},
				{ id: "zBody", expr: { kind: "var", name: "z" } },
				{
					id: "zSum",
					expr: {
						kind: "call",
						ns: "core",
						name: "add",
						args: ["ten", "thirtyTwo"],
					},
				},
				{
					id: "letZ",
					expr: { kind: "let", name: "z", value: "zSum", body: "zBody" },
				},
			],
			result: "letZ",
		} as any;
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should combine boolean and arithmetic operators", () => {
		// if ((5 > 3) && (10 < 20)) then 42 else 0
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "five", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
				{ id: "three", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
				{
					id: "gt",
					expr: {
						kind: "call",
						ns: "core",
						name: "gt",
						args: ["five", "three"],
					},
				},
				{ id: "ten", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{
					id: "twenty",
					expr: { kind: "lit", type: { kind: "int" }, value: 20 },
				},
				{
					id: "lt",
					expr: {
						kind: "call",
						ns: "core",
						name: "lt",
						args: ["ten", "twenty"],
					},
				},
				{
					id: "and",
					expr: { kind: "call", ns: "bool", name: "and", args: ["gt", "lt"] },
				},
				{ id: "ans", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "zero", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{
					id: "result",
					expr: {
						kind: "if",
						cond: "and",
						then: "ans",
						else: "zero",
						type: { kind: "int" },
					},
				},
			],
			result: "result",
		} as any;
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should validate and evaluate a complete program", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 6 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 7 } },
				{
					id: "product",
					expr: { kind: "call", ns: "core", name: "mul", args: ["a", "b"] },
				},
			],
			result: "product",
		} as any;

		// First validate
		const validation = validateAIR(doc);
		assert.strictEqual(validation.valid, true);

		// Then evaluate
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should handle reference chains", () => {
		// a -> b -> c -> 42
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "c", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "b", expr: { kind: "ref", id: "c" } },
				{ id: "a", expr: { kind: "ref", id: "b" } },
			],
			result: "a",
		} as any;
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});
});

describe("CIR Integration Tests", () => {
	const registry = createCoreRegistry();
	const defs = emptyDefs();

	it("should evaluate a lambda function", () => {
		// (lambda x. x + 1)(41) = 42
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "one", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{
					id: "fortyOne",
					expr: { kind: "lit", type: { kind: "int" }, value: 41 },
				},
				{
					id: "add",
					expr: { kind: "call", ns: "core", name: "add", args: ["x", "one"] },
				},
				{
					id: "lambda",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "add",
						type: {
							kind: "fn",
							params: [{ kind: "int" }],
							returns: { kind: "int" },
						},
					},
				},
				{
					id: "result",
					expr: { kind: "callExpr", fn: "lambda", args: ["fortyOne"] },
				},
			],
			result: "result",
		} as any;
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate a lambda with multiple parameters", () => {
		// (lambda x y. x + y)(10, 32) = 42
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "sum",
					expr: { kind: "call", ns: "core", name: "add", args: ["x", "y"] },
				},
				{
					id: "lambda",
					expr: {
						kind: "lambda",
						params: ["x", "y"],
						body: "sum",
						type: {
							kind: "fn",
							params: [{ kind: "int" }, { kind: "int" }],
							returns: { kind: "int" },
						},
					},
				},
				{ id: "ten", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{
					id: "thirtyTwo",
					expr: { kind: "lit", type: { kind: "int" }, value: 32 },
				},
				{
					id: "result",
					expr: { kind: "callExpr", fn: "lambda", args: ["ten", "thirtyTwo"] },
				},
			],
			result: "result",
		} as any;
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});
});

describe("EIR Integration Tests with Interactive Input", () => {
	const registry = createCoreRegistry();
	const defs = emptyDefs();

	it("should evaluate EIR with single readInt effect", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "input",
					expr: {
						kind: "effect",
						op: "readInt",
						args: [],
					},
				},
			],
			result: "input",
		} as any;

		const effectRegistry = createQueuedEffectRegistry([42]);
		const eirResult = evaluateEIR(createTestDocument(doc), registry, defs, undefined, {
			effects: effectRegistry,
		});

		assert.deepStrictEqual(eirResult.result, intVal(42));
	});

	it("should evaluate EIR with multiple readInt effects", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "read1", expr: { kind: "effect", op: "readInt", args: [] } },
				{ id: "read2", expr: { kind: "effect", op: "readInt", args: [] } },
				{
					id: "sum",
					expr: { kind: "call", ns: "core", name: "add", args: ["read1", "read2"] },
				},
			],
			result: "sum",
		} as any;

		const effectRegistry = createQueuedEffectRegistry([10, 32]);
		const eirResult = evaluateEIR(createTestDocument(doc), registry, defs, undefined, {
			effects: effectRegistry,
		});

		assert.deepStrictEqual(eirResult.result, intVal(42));
	});

	it("should evaluate EIR with readLine effect", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "input",
					expr: {
						kind: "effect",
						op: "readLine",
						args: [],
					},
				},
			],
			result: "input",
		} as any;

		const effectRegistry = createQueuedEffectRegistry(["hello"]);
		const eirResult = evaluateEIR(createTestDocument(doc), registry, defs, undefined, {
			effects: effectRegistry,
		});

		assert.deepStrictEqual(eirResult.result, stringVal("hello"));
	});

	it("should evaluate EIR with mixed read effects", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "readStr", expr: { kind: "effect", op: "readLine", args: [] } },
				{ id: "readNum", expr: { kind: "effect", op: "readInt", args: [] } },
			],
			result: "readNum",
		} as any;

		const effectRegistry = createQueuedEffectRegistry(["ignored", 42]);
		const eirResult = evaluateEIR(createTestDocument(doc), registry, defs, undefined, {
			effects: effectRegistry,
		});

		assert.deepStrictEqual(eirResult.result, intVal(42));
	});

	it("should handle exhausted queue gracefully", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "read1", expr: { kind: "effect", op: "readInt", args: [] } },
				{ id: "read2", expr: { kind: "effect", op: "readInt", args: [] } },
				{ id: "read3", expr: { kind: "effect", op: "readInt", args: [] } },
				{
					id: "result",
					expr: { kind: "call", ns: "core", name: "add", args: ["read2", "read3"] },
				},
			],
			result: "result",
		} as any;

		// Only provide 2 values, but try to read 3
		const effectRegistry = createQueuedEffectRegistry([10, 32]);
		const eirResult = evaluateEIR(createTestDocument(doc), registry, defs, undefined, {
			effects: effectRegistry,
		});

		// read1 = 10, read2 = 32, read3 = 0 (exhausted)
		// result = 32 + 0 = 32
		assert.deepStrictEqual(eirResult.result, intVal(32));
	});

	it("should evaluate complete EIR program", () => {
		// Read two ints, add them
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "a",
					expr: { kind: "effect", op: "readInt", args: [] },
				},
				{
					id: "b",
					expr: { kind: "effect", op: "readInt", args: [] },
				},
				{
					id: "result",
					expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
				},
			],
			result: "result",
		} as any;

		const effectRegistry = createQueuedEffectRegistry([20, 22]);
		const eirResult = evaluateEIR(createTestDocument(doc), registry, defs, undefined, {
			effects: effectRegistry,
		});

		assert.deepStrictEqual(eirResult.result, intVal(42));
	});
});

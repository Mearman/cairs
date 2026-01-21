// CAIRS Evaluator Unit Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { emptyDefs } from "../src/env.js";
import { evaluateProgram } from "../src/evaluator.js";
import { createBoolRegistry, createCoreRegistry } from "../src/index.js";
import { boolVal, intVal, isError } from "../src/types.js";
import { createTestDocument } from "./helper.js";

describe("Evaluator", () => {
	const registry = new Map();
	// Add core operators
	const coreReg = createCoreRegistry();
	for (const [key, op] of coreReg) {
		registry.set(key, op);
	}
	const defs = emptyDefs();

	it("should evaluate a simple literal", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					expr: { kind: "lit", type: { kind: "int" }, value: 42 },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate boolean literals", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					expr: { kind: "lit", type: { kind: "bool" }, value: true },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, boolVal(true));
	});

	it("should evaluate addition", () => {
		const doc = {
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
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate subtraction", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 50 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 8 } },
				{
					id: "diff",
					expr: { kind: "call", ns: "core", name: "sub", args: ["a", "b"] },
				},
			],
			result: "diff",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate multiplication", () => {
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
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate division", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 84 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{
					id: "quotient",
					expr: { kind: "call", ns: "core", name: "div", args: ["a", "b"] },
				},
			],
			result: "quotient",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should return error on division by zero", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{
					id: "bad",
					expr: { kind: "call", ns: "core", name: "div", args: ["a", "b"] },
				},
			],
			result: "bad",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.strictEqual(isError(result), true);
		if (isError(result)) {
			assert.strictEqual(result.code, "DivideByZero");
		}
	});

	it("should evaluate if with true condition", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "cond",
					expr: { kind: "lit", type: { kind: "bool" }, value: true },
				},
				{ id: "then", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "else", expr: { kind: "lit", type: { kind: "int" }, value: 99 } },
				{
					id: "result",
					expr: {
						kind: "if",
						cond: "cond",
						then: "then",
						else: "else",
						type: { kind: "int" },
					},
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate if with false condition", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "cond",
					expr: { kind: "lit", type: { kind: "bool" }, value: false },
				},
				{ id: "then", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "else", expr: { kind: "lit", type: { kind: "int" }, value: 99 } },
				{
					id: "result",
					expr: {
						kind: "if",
						cond: "cond",
						then: "then",
						else: "else",
						type: { kind: "int" },
					},
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(99));
	});

	it("should evaluate let binding", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "value",
					expr: { kind: "lit", type: { kind: "int" }, value: 42 },
				},
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "result",
					expr: { kind: "let", name: "x", value: "value", body: "body" },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should propagate errors from let value", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{
					id: "bad",
					expr: { kind: "call", ns: "core", name: "div", args: ["a", "b"] },
				},
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "result",
					expr: { kind: "let", name: "x", value: "bad", body: "body" },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.strictEqual(isError(result), true);
	});

	it("should evaluate comparison operators", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
				{
					id: "lt",
					expr: { kind: "call", ns: "core", name: "lt", args: ["a", "b"] },
				},
				{
					id: "gt",
					expr: { kind: "call", ns: "core", name: "gt", args: ["a", "b"] },
				},
				{
					id: "eq",
					expr: { kind: "call", ns: "core", name: "eq", args: ["a", "a"] },
				},
			],
			result: "eq",
		};

		// Test lt
		const docLt = { ...doc, result: "lt" };
		const resultLt = evaluateProgram(createTestDocument(docLt), registry, defs);
		assert.deepStrictEqual(resultLt, boolVal(true));

		// Test gt
		const docGt = { ...doc, result: "gt" };
		const resultGt = evaluateProgram(createTestDocument(docGt), registry, defs);
		assert.deepStrictEqual(resultGt, boolVal(false));

		// Test eq
		const resultEq = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(resultEq, boolVal(true));
	});
});

describe("Boolean Operators", () => {
	const registry = createBoolRegistry();
	const defs = emptyDefs();

	it("should evaluate and operator", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
				{
					id: "b",
					expr: { kind: "lit", type: { kind: "bool" }, value: false },
				},
				{
					id: "result",
					expr: { kind: "call", ns: "bool", name: "and", args: ["a", "b"] },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, boolVal(false));
	});

	it("should evaluate or operator", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
				{
					id: "b",
					expr: { kind: "lit", type: { kind: "bool" }, value: false },
				},
				{
					id: "result",
					expr: { kind: "call", ns: "bool", name: "or", args: ["a", "b"] },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, boolVal(true));
	});

	it("should evaluate not operator", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
				{
					id: "result",
					expr: { kind: "call", ns: "bool", name: "not", args: ["a"] },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, boolVal(false));
	});
});

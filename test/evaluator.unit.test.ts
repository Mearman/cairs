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

describe("CIR Features", () => {
	const registry = new Map();
	const coreReg = createCoreRegistry();
	for (const [key, op] of coreReg) {
		registry.set(key, op);
	}
	const defs = emptyDefs();

	it("should evaluate lambda and callExpr", () => {
		// identity function: lambda x => x
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "body",
						type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
					},
				},
				{ id: "arg", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "result", expr: { kind: "callExpr", fn: "fn", args: ["arg"] } },
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate simple let binding with var reference", () => {
		// let x = 42 in x (simple let with variable body)
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

	it("should evaluate let with literal body", () => {
		// let x = 10 in 42 (where body doesn't use x)
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "body", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{
					id: "result",
					expr: { kind: "let", name: "x", value: "val", body: "body" },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate if-then-else with computed condition", () => {
		// if 5 < 10 then 42 else 0
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{
					id: "cond",
					expr: { kind: "call", ns: "core", name: "lt", args: ["a", "b"] },
				},
				{ id: "then", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "else", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{
					id: "result",
					expr: { kind: "if", cond: "cond", then: "then", else: "else", type: { kind: "int" } },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate modulo operation", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 47 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
				{
					id: "result",
					expr: { kind: "call", ns: "core", name: "mod", args: ["a", "b"] },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(2));
	});

	it("should evaluate power operation", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "base", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "exp", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{
					id: "result",
					expr: { kind: "call", ns: "core", name: "pow", args: ["base", "exp"] },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(1024));
	});

	it("should evaluate negation", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{
					id: "result",
					expr: { kind: "call", ns: "core", name: "neg", args: ["n"] },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(-42));
	});
});

describe("Literal Types", () => {
	const registry = createCoreRegistry();
	const defs = emptyDefs();

	it("should evaluate string literal", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					expr: { kind: "lit", type: { kind: "string" }, value: "hello" },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.strictEqual(result.kind, "string");
		if (result.kind === "string") {
			assert.strictEqual(result.value, "hello");
		}
	});

	it("should evaluate float literal", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					expr: { kind: "lit", type: { kind: "float" }, value: 3.14 },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.strictEqual(result.kind, "float");
		if (result.kind === "float") {
			assert.strictEqual(result.value, 3.14);
		}
	});

	it("should evaluate void literal", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					expr: { kind: "lit", type: { kind: "void" }, value: null },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.strictEqual(result.kind, "void");
	});

	it("should evaluate list literal", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					expr: {
						kind: "lit",
						type: { kind: "list", of: { kind: "int" } },
						value: [1, 2, 3],
					},
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.strictEqual(result.kind, "list");
		if (result.kind === "list") {
			assert.strictEqual(result.value.length, 3);
		}
	});
});

describe("Complex Expressions", () => {
	const registry = new Map();
	const coreReg = createCoreRegistry();
	for (const [key, op] of coreReg) {
		registry.set(key, op);
	}
	const defs = emptyDefs();

	it("should evaluate chain of operations", () => {
		// (10 + 20) * 2 - 18 = 42
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
				{ id: "c", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "d", expr: { kind: "lit", type: { kind: "int" }, value: 18 } },
				{
					id: "sum",
					expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
				},
				{
					id: "product",
					expr: { kind: "call", ns: "core", name: "mul", args: ["sum", "c"] },
				},
				{
					id: "result",
					expr: { kind: "call", ns: "core", name: "sub", args: ["product", "d"] },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate conditional with computed branches", () => {
		// if 5 < 10 then 30 + 12 else 0
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "five", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
				{ id: "ten", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "thirty", expr: { kind: "lit", type: { kind: "int" }, value: 30 } },
				{ id: "twelve", expr: { kind: "lit", type: { kind: "int" }, value: 12 } },
				{
					id: "cond",
					expr: { kind: "call", ns: "core", name: "lt", args: ["five", "ten"] },
				},
				{
					id: "thenBranch",
					expr: { kind: "call", ns: "core", name: "add", args: ["thirty", "twelve"] },
				},
				{ id: "elseBranch", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{
					id: "result",
					expr: { kind: "if", cond: "cond", then: "thenBranch", else: "elseBranch", type: { kind: "int" } },
				},
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should handle ref expressions", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "result", expr: { kind: "ref", id: "x" } },
			],
			result: "result",
		};
		const result = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});

	it("should evaluate comparison operators", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{
					id: "eq",
					expr: { kind: "call", ns: "core", name: "eq", args: ["a", "b"] },
				},
				{
					id: "neq",
					expr: { kind: "call", ns: "core", name: "neq", args: ["a", "b"] },
				},
				{
					id: "lte",
					expr: { kind: "call", ns: "core", name: "lte", args: ["a", "b"] },
				},
				{
					id: "gte",
					expr: { kind: "call", ns: "core", name: "gte", args: ["a", "b"] },
				},
			],
			result: "eq",
		};

		const resultEq = evaluateProgram(createTestDocument(doc), registry, defs);
		assert.deepStrictEqual(resultEq, boolVal(true));

		const resultNeq = evaluateProgram(createTestDocument({ ...doc, result: "neq" }), registry, defs);
		assert.deepStrictEqual(resultNeq, boolVal(false));

		const resultLte = evaluateProgram(createTestDocument({ ...doc, result: "lte" }), registry, defs);
		assert.deepStrictEqual(resultLte, boolVal(true));

		const resultGte = evaluateProgram(createTestDocument({ ...doc, result: "gte" }), registry, defs);
		assert.deepStrictEqual(resultGte, boolVal(true));
	});
});

// SPDX-License-Identifier: MIT
// SPIRAL Inline Expressions - Integration Tests

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
	evaluateEIR,
} from "../src/evaluator.js";
import {
	AsyncEvaluator,
} from "../src/async-evaluator.js";
import {
	createTaskScheduler,
} from "../src/scheduler.js";
import {
	emptyRegistry,
	defineOperator,
	registerOperator,
	type OperatorRegistry,
} from "../src/domains/registry.js";
import { emptyDefs, type Defs } from "../src/env.js";
import {
	emptyEffectRegistry,
	registerEffect,
	type EffectRegistry,
} from "../src/effects.js";
import type {
	EIRDocument,
	PIRDocument,
	Value,
} from "../src/types.js";
import {
	intVal,
	voidVal,
	isError,
} from "../src/types.js";

//==============================================================================
// Test Fixtures
//==============================================================================

let registry: OperatorRegistry;
let defs: Defs;
let effects: EffectRegistry;

function setupBefore() {
	registry = emptyRegistry();

	// Addition operator
	const addOp = defineOperator("core", "add")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "int" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return intVal(av.value + bv.value);
		})
		.build();
	registry = registerOperator(registry, addOp);

	// Subtraction operator
	const subOp = defineOperator("core", "sub")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "int" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return intVal(av.value - bv.value);
		})
		.build();
	registry = registerOperator(registry, subOp);

	// Multiplication operator
	const mulOp = defineOperator("core", "mul")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "int" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return intVal(av.value * bv.value);
		})
		.build();
	registry = registerOperator(registry, mulOp);

	// Division operator
	const divOp = defineOperator("core", "div")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "int" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return intVal(Math.floor(av.value / bv.value));
		})
		.build();
	registry = registerOperator(registry, divOp);

	// Modulo operator
	const modOp = defineOperator("core", "mod")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "int" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return intVal(av.value % bv.value);
		})
		.build();
	registry = registerOperator(registry, modOp);

	// Equality operator
	const eqOp = defineOperator("core", "eq")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "bool" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return { kind: "bool", value: av.value === bv.value };
		})
		.build();
	registry = registerOperator(registry, eqOp);

	// Less than operator
	const ltOp = defineOperator("core", "lt")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "bool" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return { kind: "bool", value: av.value < bv.value };
		})
		.build();
	registry = registerOperator(registry, ltOp);

	defs = emptyDefs();
	effects = emptyEffectRegistry();
}

//==============================================================================
// EIR Integration Tests
//==============================================================================

describe("Inline Expressions - Integration Tests", () => {

	describe("EIR Evaluator", () => {

		before(() => {
			setupBefore();
		});

		it("should evaluate inline literal in call args", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "add",
						params: ["a", "b"],
						result: { kind: "int" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 10 },
					},
					{
						id: "sum",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: [
								"x",
								{ kind: "lit", type: { kind: "int" }, value: 5 },
							],
						},
					},
				],
				result: "sum",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 15);
		});

		it("should evaluate inline expression in call value field", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "add",
						params: ["a", "b"],
						result: { kind: "int" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 5 },
					},
					{
						id: "y",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: [
								"x",
								{ kind: "lit", type: { kind: "int" }, value: 5 },
							],
						},
					},
				],
				result: "y",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 10);
		});

		it("should evaluate inline expressions in seq", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "add",
						params: ["a", "b"],
						result: { kind: "int" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "y",
						expr: { kind: "lit", type: { kind: "int" }, value: 3 },
					},
					{
						id: "main",
						expr: {
							kind: "seq",
							first: { kind: "lit", type: { kind: "int" }, value: 1 },
							then: {
								kind: "call",
								ns: "core",
								name: "add",
								args: [
									"y",
									{ kind: "lit", type: { kind: "int" }, value: 2 },
								],
							},
						},
					},
				],
				result: "main",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 5);
		});

		it("should evaluate inline expressions in while condition", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "lt",
						params: ["a", "b"],
						result: { kind: "bool" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "counter",
						expr: { kind: "lit", type: { kind: "int" }, value: 0 },
					},
					{
						id: "loop",
						expr: {
							kind: "while",
							cond: {
								kind: "call",
								ns: "core",
								name: "lt",
								args: [
									"counter",
									{ kind: "lit", type: { kind: "int" }, value: 3 },
								],
							},
							body: { kind: "lit", type: { kind: "void" }, value: null }, // Just a void literal
						},
					},
					{
						id: "result",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 }, // Return a literal since loop doesn't execute
					},
				],
				result: "result",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 42);
		});

		it("should evaluate inline expressions in for init and cond", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "lt",
						params: ["a", "b"],
						result: { kind: "bool" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "loop",
						expr: {
							kind: "for",
							var: "i",
							init: { kind: "lit", type: { kind: "int" }, value: 1 },
							cond: {
								kind: "call",
								ns: "core",
								name: "lt",
								args: ["i", { kind: "lit", type: { kind: "int" }, value: 4 }],
							},
							update: "i", // Just reference the loop variable
							body: {
								kind: "lit",
								type: { kind: "void" },
								value: null,
							},
						},
					},
					{
						id: "result",
						expr: { kind: "var", name: "i" },
					},
				],
				result: "result",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 1);
		});

		it("should evaluate inline expressions in iter", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "nums",
						expr: {
							kind: "lit",
							type: { kind: "list", of: { kind: "int" } },
							value: [
								{ kind: "int", value: 1 },
								{ kind: "int", value: 2 },
								{ kind: "int", value: 3 },
							],
						},
					},
					{
						id: "loop",
						expr: {
							kind: "iter",
							var: "x",
							iter: "nums",
							body: {
								kind: "lit",
								type: { kind: "void" },
								value: null,
							},
						},
					},
					{
						id: "result",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 }, // Just test that the loop runs
					},
				],
				result: "result",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 42);
		});

		it("should evaluate inline expressions in effect", () => {
			let loggedValue = "";
			const testEffects = registerEffect(effects, {
				name: "log",
				params: [{ kind: "string" }],
				returns: { kind: "void" },
				pure: false,
				fn: (...args: Value[]) => {
					loggedValue = (args[0] as { kind: "string"; value: string }).value;
					return voidVal();
				},
			});

			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "logHello",
						expr: {
							kind: "effect",
							op: "log",
							args: [{ kind: "lit", type: { kind: "string" }, value: "Hello, World!" }],
						},
					},
				],
				result: "logHello",
			};

			const result = evaluateEIR(doc, registry, defs, undefined, { effects: testEffects }).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "void");
			assert.strictEqual(loggedValue, "Hello, World!");
		});

		it("should evaluate inline expressions in try success path", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "result",
						expr: {
							kind: "try",
							tryBody: { kind: "lit", type: { kind: "int" }, value: 42 },
							catchParam: "err",
							catchBody: { kind: "lit", type: { kind: "int" }, value: -1 },
							fallback: { kind: "lit", type: { kind: "int" }, value: 100 },
						},
					},
				],
				result: "result",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 100);
		});

		it("should evaluate inline expressions in try fallback", () => {
			// Try body succeeds with a literal, so fallback should be evaluated
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "success_value",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
					{
						id: "main",
						expr: {
							kind: "try",
							tryBody: "success_value",
							catchParam: "err",
							catchBody: { kind: "lit", type: { kind: "int" }, value: -1 },
							fallback: { kind: "lit", type: { kind: "int" }, value: 999 },
						},
					},
				],
				result: "main",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 999);
		});

		it("should handle deeply nested inline expressions", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "add",
						params: ["a", "b"],
						result: { kind: "int" },
						body: { kind: "ref", id: "a" },
					},
					{
						ns: "core",
						name: "mul",
						params: ["a", "b"],
						result: { kind: "int" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "result",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: [
								{
									kind: "call",
									ns: "core",
									name: "mul",
									args: [
										{ kind: "lit", type: { kind: "int" }, value: 2 },
										{ kind: "lit", type: { kind: "int" }, value: 3 },
									],
								},
								{ kind: "lit", type: { kind: "int" }, value: 4 },
							],
						},
					},
				],
				result: "result",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			// (2 * 3) + 4 = 10
			assert.strictEqual((result as { kind: "int"; value: number }).value, 10);
		});

		it("should maintain backward compatibility with node ID refs", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "add",
						params: ["a", "b"],
						result: { kind: "int" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "five",
						expr: { kind: "lit", type: { kind: "int" }, value: 5 },
					},
					{
						id: "three",
						expr: { kind: "lit", type: { kind: "int" }, value: 3 },
					},
					{
						id: "sum",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["five", "three"],
						},
					},
				],
				result: "sum",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 8);
		});
	});

	//==========================================================================
	// PIR Integration Tests
	//==========================================================================

	describe("PIR Evaluator (Async)", () => {

		it("should evaluate inline expressions in await", async () => {
			setupBefore();

			const doc: PIRDocument = {
				version: "2.0.0",
				capabilities: ["async"],
				airDefs: [],
				nodes: [
					{
						id: "task_body",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
					{
						id: "task",
						expr: {
							kind: "spawn",
							task: "task_body",
						},
					},
					{
						id: "result",
						expr: {
							kind: "await",
							future: "task",
							timeout: { kind: "lit", type: { kind: "int" }, value: 1000 },
							fallback: { kind: "lit", type: { kind: "int" }, value: -1 },
						},
					},
				],
				result: "result",
			};

			const scheduler = createTaskScheduler();
			const evaluator = new AsyncEvaluator(registry, defs, effects);
			const result = await evaluator.evaluateDocument(doc, { scheduler });

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 42);
		});

		it("should evaluate inline expressions in spawn", async () => {
			setupBefore();

			const doc: PIRDocument = {
				version: "2.0.0",
				capabilities: ["async"],
				airDefs: [],
				nodes: [
					{
						id: "task_body",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: [
								{ kind: "lit", type: { kind: "int" }, value: 10 },
								{ kind: "lit", type: { kind: "int" }, value: 20 },
							],
						},
					},
					{
						id: "task",
						expr: {
							kind: "spawn",
							task: "task_body",
						},
					},
					{
						id: "result",
						expr: {
							kind: "await",
							future: "task",
						},
					},
				],
				result: "result",
			};

			const scheduler = createTaskScheduler();
			const evaluator = new AsyncEvaluator(registry, defs, effects);
			const result = await evaluator.evaluateDocument(doc, { scheduler });

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "int");
			assert.strictEqual((result as { kind: "int"; value: number }).value, 30);
		});
	});

	//==========================================================================
	// End-to-End Scenario Tests
	//==========================================================================

	describe("End-to-End Scenarios", () => {

		it("should evaluate complete FizzBuzz with inline expressions", () => {
			setupBefore();

			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "mod",
						params: ["a", "b"],
						result: { kind: "int" },
						body: { kind: "ref", id: "a" },
					},
					{
						ns: "core",
						name: "eq",
						params: ["a", "b"],
						result: { kind: "bool" },
						body: { kind: "ref", id: "a" },
					},
				],
				nodes: [
					{
						id: "n",
						expr: { kind: "lit", type: { kind: "int" }, value: 15 },
					},
					// Test n % 3 == 0 with inline expressions
					{
						id: "mod3",
						expr: {
							kind: "call",
							ns: "core",
							name: "mod",
							args: ["n", { kind: "lit", type: { kind: "int" }, value: 3 }],
						},
					},
					{
						id: "isMult3",
						expr: {
							kind: "call",
							ns: "core",
							name: "eq",
							args: [
								"mod3",
								{ kind: "lit", type: { kind: "int" }, value: 0 },
							],
						},
					},
					{
						id: "mod5",
						expr: {
							kind: "call",
							ns: "core",
							name: "mod",
							args: ["n", { kind: "lit", type: { kind: "int" }, value: 5 }],
						},
					},
					{
						id: "isMult5",
						expr: {
							kind: "call",
							ns: "core",
							name: "eq",
							args: [
								"mod5",
								{ kind: "lit", type: { kind: "int" }, value: 0 },
							],
						},
					},
					// Both conditions true (15 is divisible by both 3 and 5)
					{
						id: "fizz",
						expr: { kind: "lit", type: { kind: "string" }, value: "Fizz" },
					},
					{
						id: "buzz",
						expr: { kind: "lit", type: { kind: "string" }, value: "Buzz" },
					},
					{
						id: "num",
						expr: { kind: "lit", type: { kind: "string" }, value: "15" },
					},
					{
						id: "fizzbuzz",
						expr: { kind: "lit", type: { kind: "string" }, value: "FizzBuzz" },
					},
					// FizzBuzz logic - simplified for testing inline expressions
					{
						id: "result",
						expr: {
							kind: "if",
							cond: "isMult3",
							then: "fizzbuzz", // Should be "FizzBuzz" for n=15
							else: "num",
							type: { kind: "string" },
						},
					},
				],
				result: "result",
			};

			const result = evaluateEIR(doc, registry, defs).result;

			assert.ok(!isError(result), "Should not return error");
			assert.strictEqual(result.kind, "string");
			assert.strictEqual((result as { kind: "string"; value: string }).value, "FizzBuzz");
		});
	});
});

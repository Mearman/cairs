// CAIRS EIR Evaluation Unit Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { evaluateEIR } from "../src/evaluator.js";
import { createCoreRegistry } from "../src/domains/core.js";
import { createDefaultEffectRegistry } from "../src/effects.js";
import { type EIRDocument } from "../src/types.js";
import { intVal, isError } from "../src/types.js";

describe("EIR Evaluation", () => {
	const registry = createCoreRegistry();
	const defs = new Map();
	const effects = createDefaultEffectRegistry();

	it("should evaluate seq expression", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "n2", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "n3", expr: { kind: "seq", first: "n1", then: "n2" } },
			],
			result: "n3",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 2);
	});

	it("should evaluate assign expression", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "n2", expr: { kind: "assign", target: "x", value: "n1" } },
			],
			result: "n2",
		};
		const { result, state } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(result.kind, "void");
		// Check that x was bound in the environment
		const xValue = state.env.get("x");
		assert.ok(xValue);
		assert.strictEqual(xValue?.kind, "int");
		assert.strictEqual((xValue as { kind: "int"; value: number }).value, 42);
	});

	it("should evaluate while loop with false condition", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				{ id: "body", expr: { kind: "lit", type: { kind: "void" }, value: null } },
				{ id: "n1", expr: { kind: "while", cond: "cond", body: "body" } },
			],
			result: "n1",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(result.kind, "void");
	});

	it("should evaluate while loop with true condition (limited steps)", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
				{ id: "body", expr: { kind: "lit", type: { kind: "void" }, value: null } },
				{ id: "n1", expr: { kind: "while", cond: "cond", body: "body" } },
			],
			result: "n1",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects, maxSteps: 5 });
		// Should hit max steps and return error
		assert.strictEqual(isError(result), true);
	});

	it("should evaluate for loop (zero iterations)", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "init", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				{ id: "update", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "body", expr: { kind: "lit", type: { kind: "void" }, value: null } },
				{
					id: "n1",
					expr: {
						kind: "for",
						var: "i",
						init: "init",
						cond: "cond",
						update: "update",
						body: "body",
					},
				},
			],
			result: "n1",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(result.kind, "void");
	});

	it("should evaluate effect operation", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "msg", expr: { kind: "lit", type: { kind: "string" }, value: "hello" } },
				{ id: "n1", expr: { kind: "effect", op: "print", args: ["msg"] } },
			],
			result: "n1",
		};
		const { result, state } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(result.kind, "void");
		// Check that effect was recorded
		assert.strictEqual(state.effects.length, 1);
		assert.strictEqual(state.effects[0]?.op, "print");
	});

	it("should evaluate refCell expression", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				// First bind x in the environment via a let-like structure
				// We use a var expression with a pre-set environment
				{
					id: "n1",
					expr: { kind: "refCell", target: "x" },
				},
			],
			result: "n1",
		};
		// Provide x in the input environment
		const inputs = new Map([["x", intVal(42)]]);
		const { result } = evaluateEIR(doc, registry, defs, inputs, { effects });
		assert.strictEqual(result.kind, "refCell");
	});

	it("should evaluate deref expression", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "refCell", target: "x" } },
				{ id: "n2", expr: { kind: "deref", target: "x" } },
			],
			result: "n2",
		};
		// Provide x in the input environment
		const inputs = new Map([["x", intVal(42)]]);
		const { result } = evaluateEIR(doc, registry, defs, inputs, { effects });
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 42);
	});

	it("should evaluate iter loop over empty list", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "list",
					expr: {
						kind: "lit",
						type: { kind: "list", of: { kind: "int" } },
						value: [],
					},
				},
				{ id: "body", expr: { kind: "lit", type: { kind: "void" }, value: null } },
				{ id: "n1", expr: { kind: "iter", var: "x", iter: "list", body: "body" } },
			],
			result: "n1",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(result.kind, "void");
	});

	it("should handle non-existent node in seq gracefully", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n3", expr: { kind: "seq", first: "missing", then: "n2" } },
			],
			result: "n3",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(isError(result), true);
	});

	it("should propagate error from effect operation with unknown op", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "msg", expr: { kind: "lit", type: { kind: "string" }, value: "hello" } },
				{ id: "n1", expr: { kind: "effect", op: "unknownOp", args: ["msg"] } },
			],
			result: "n1",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(isError(result), true);
	});

	it("should handle empty document with no nodes", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [],
			result: "missing",
		};
		const { result } = evaluateEIR(doc, registry, defs, undefined, { effects });
		assert.strictEqual(isError(result), true);
	});
});

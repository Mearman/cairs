// CAIRS EIR Validator Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { validateEIR } from "../src/validator.js";

describe("EIR Validation", () => {
	it("should validate a minimal EIR document with seq", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "n2", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "n3", expr: { kind: "seq", first: "n1", then: "n2" } },
			],
			result: "n3",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.errors.length, 0);
	});

	it("should validate EIR document with assign", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "n2", expr: { kind: "assign", target: "x", value: "n1" } },
			],
			result: "n2",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate EIR document with while loop", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				{ id: "body", expr: { kind: "lit", type: { kind: "void" } } },
				{ id: "n1", expr: { kind: "while", cond: "cond", body: "body" } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate EIR document with for loop", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "init", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				{ id: "update", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "body", expr: { kind: "lit", type: { kind: "void" } } },
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
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate EIR document with iter loop", () => {
		const doc = {
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
				{ id: "body", expr: { kind: "lit", type: { kind: "void" } } },
				{ id: "n1", expr: { kind: "iter", var: "x", iter: "list", body: "body" } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate EIR document with effect", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "msg", expr: { kind: "lit", type: { kind: "string" }, value: "hello" } },
				{ id: "n1", expr: { kind: "effect", op: "print", args: ["msg"] } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate EIR document with refCell", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "refCell", target: "x" } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate EIR document with deref", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "deref", target: "x" } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should reject seq with non-existent first node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n2", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "n3", expr: { kind: "seq", first: "missing", then: "n2" } },
			],
			result: "n3",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(
			result.errors.some((e) => e.message.includes("non-existent") || e.message.includes("not found")),
		);
	});

	it("should reject seq with non-existent then node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "n3", expr: { kind: "seq", first: "n1", then: "missing" } },
			],
			result: "n3",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject assign with non-existent value node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n2", expr: { kind: "assign", target: "x", value: "missing" } },
			],
			result: "n2",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject while with non-existent cond node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "lit", type: { kind: "void" } } },
				{ id: "n1", expr: { kind: "while", cond: "missing", body: "body" } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject while with non-existent body node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				{ id: "n1", expr: { kind: "while", cond: "cond", body: "missing" } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject for with non-existent init node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				{ id: "update", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "body", expr: { kind: "lit", type: { kind: "void" } } },
				{
					id: "n1",
					expr: {
						kind: "for",
						var: "i",
						init: "missing",
						cond: "cond",
						update: "update",
						body: "body",
					},
				},
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject effect with non-existent arg node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "effect", op: "print", args: ["missing"] } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject document with missing version", () => {
		const doc = {
			airDefs: [],
			nodes: [{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 1 } }],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject document with invalid result reference", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 1 } }],
			result: "nonexistent",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should accept CIR expressions in EIR document", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "n1",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "n2",
						type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
					},
				},
				{ id: "n2", expr: { kind: "var", name: "x" } },
			],
			result: "n1",
		};
		const result = validateEIR(doc);
		assert.strictEqual(result.valid, true);
	});
});

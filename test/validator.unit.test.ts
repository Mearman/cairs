// CAIRS Validator Unit Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { validateAIR, validateCIR } from "../src/validator.js";

describe("AIR Validation", () => {
	it("should validate a minimal AIR document", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
			],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.errors.length, 0);
	});

	it("should reject document with missing version", () => {
		const doc = {
			airDefs: [],
			nodes: [],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.length > 0);
	});

	it("should reject document with invalid version format", () => {
		const doc = {
			version: "1.0",
			airDefs: [],
			nodes: [],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject document with duplicate node IDs", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{
					id: "n1",
					expr: { kind: "lit", type: { kind: "bool" }, value: true },
				},
			],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.message.includes("Duplicate")));
	});

	it("should reject document with invalid result reference", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
			],
			result: "nonexistent",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.message.includes("non-existent")));
	});
});

describe("CIR Validation", () => {
	it("should validate a minimal CIR document with lambda", () => {
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
						type: {
							kind: "fn",
							params: [{ kind: "int" }],
							returns: { kind: "int" },
						},
					},
				},
				{ id: "n2", expr: { kind: "var", name: "x" } },
			],
			result: "n1",
		};
		const result = validateCIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should reject CIR document with lambda in AIR mode", () => {
		// This test verifies that validateAIR rejects CIR-only expressions
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
						type: {
							kind: "fn",
							params: [{ kind: "int" }],
							returns: { kind: "int" },
						},
					},
				},
				{ id: "n2", expr: { kind: "var", name: "x" } },
			],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
	});
});

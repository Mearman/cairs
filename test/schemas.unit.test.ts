// CAIRS Schema Tests
// Tests for JSON schema definitions and type guards

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	airSchema,
	cirSchema,
	eirSchema,
	lirSchema,
	isAIRSchema,
	isCIRSchema,
	isEIRSchema,
	isLIRSchema,
} from "../src/schemas.js";

describe("Schema Exports", () => {
	describe("airSchema", () => {
		it("should have correct $schema reference", () => {
			assert.strictEqual(airSchema.$schema, "http://json-schema.org/draft-07/schema#");
		});

		it("should have correct title", () => {
			assert.strictEqual(airSchema.title, "AIR Document");
		});

		it("should require version, nodes, result, airDefs", () => {
			assert.deepStrictEqual(airSchema.required, ["version", "nodes", "result", "airDefs"]);
		});

		it("should have definitions for type, expr, airDef, node", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.type);
			assert.ok(airSchema.definitions.expr);
			assert.ok(airSchema.definitions.airDef);
			assert.ok(airSchema.definitions.node);
		});

		it("should define version with semver pattern", () => {
			assert.ok(airSchema.properties.version.pattern);
			// Test the pattern works
			const pattern = new RegExp(airSchema.properties.version.pattern);
			assert.ok(pattern.test("1.0.0"));
			assert.ok(pattern.test("0.1.0-alpha"));
			assert.ok(!pattern.test("invalid"));
		});
	});

	describe("cirSchema", () => {
		it("should have correct title", () => {
			assert.strictEqual(cirSchema.title, "CIR Document");
		});

		it("should include CIR expressions in definitions", () => {
			assert.ok(cirSchema.definitions);
			assert.ok(cirSchema.definitions.expr);
			// CIR expr should include lambda, callExpr, fix
			const exprSchema = cirSchema.definitions.expr;
			assert.ok(exprSchema.oneOf);
			const kinds = exprSchema.oneOf.map((s: any) => s.properties?.kind?.const).filter(Boolean);
			assert.ok(kinds.includes("lambda"));
			assert.ok(kinds.includes("callExpr"));
			assert.ok(kinds.includes("fix"));
		});
	});

	describe("eirSchema", () => {
		it("should have correct title", () => {
			assert.strictEqual(eirSchema.title, "EIR Document");
		});

		it("should include EIR expressions in definitions", () => {
			assert.ok(eirSchema.definitions);
			assert.ok(eirSchema.definitions.expr);
			// EIR expr should include seq, assign, while, for, iter, effect, refCell, deref
			const exprSchema = eirSchema.definitions.expr;
			assert.ok(exprSchema.oneOf);
			const kinds = exprSchema.oneOf.map((s: any) => s.properties?.kind?.const).filter(Boolean);
			assert.ok(kinds.includes("seq"));
			assert.ok(kinds.includes("assign"));
			assert.ok(kinds.includes("while"));
			assert.ok(kinds.includes("for"));
			assert.ok(kinds.includes("iter"));
			assert.ok(kinds.includes("effect"));
			assert.ok(kinds.includes("refCell"));
			assert.ok(kinds.includes("deref"));
		});
	});

	describe("lirSchema", () => {
		it("should have correct title", () => {
			assert.strictEqual(lirSchema.title, "LIR Document");
		});

		it("should require version, blocks, entry", () => {
			assert.deepStrictEqual(lirSchema.required, ["version", "blocks", "entry"]);
		});

		it("should define blocks as array", () => {
			assert.strictEqual(lirSchema.properties.blocks.type, "array");
		});
	});
});

describe("Schema Type Guards", () => {
	describe("isAIRSchema", () => {
		it("should return true for object with $schema", () => {
			assert.strictEqual(isAIRSchema({ $schema: "test" }), true);
		});

		it("should return false for null", () => {
			assert.strictEqual(isAIRSchema(null), false);
		});

		it("should return false for non-object", () => {
			assert.strictEqual(isAIRSchema("string"), false);
			assert.strictEqual(isAIRSchema(42), false);
			assert.strictEqual(isAIRSchema(undefined), false);
		});

		it("should return false for object without $schema", () => {
			assert.strictEqual(isAIRSchema({ version: "1.0.0" }), false);
		});
	});

	describe("isCIRSchema", () => {
		it("should return true for object with $schema", () => {
			assert.strictEqual(isCIRSchema({ $schema: "test" }), true);
		});

		it("should return false for null", () => {
			assert.strictEqual(isCIRSchema(null), false);
		});

		it("should return false for non-object", () => {
			assert.strictEqual(isCIRSchema("string"), false);
		});
	});

	describe("isEIRSchema", () => {
		it("should return true for object with $schema", () => {
			assert.strictEqual(isEIRSchema({ $schema: "test" }), true);
		});

		it("should return false for null", () => {
			assert.strictEqual(isEIRSchema(null), false);
		});

		it("should return false for non-object", () => {
			assert.strictEqual(isEIRSchema(42), false);
		});
	});

	describe("isLIRSchema", () => {
		it("should return true for object with $schema", () => {
			assert.strictEqual(isLIRSchema({ $schema: "test" }), true);
		});

		it("should return false for null", () => {
			assert.strictEqual(isLIRSchema(null), false);
		});

		it("should return false for object without $schema", () => {
			assert.strictEqual(isLIRSchema({ blocks: [] }), false);
		});
	});
});

describe("Type Schema Definitions", () => {
	it("should define all primitive types", () => {
		const typeSchema = airSchema.definitions.type;
		assert.ok(typeSchema.oneOf);

		const kinds = typeSchema.oneOf.map((s: any) => s.properties?.kind?.const).filter(Boolean);
		assert.ok(kinds.includes("bool"));
		assert.ok(kinds.includes("int"));
		assert.ok(kinds.includes("float"));
		assert.ok(kinds.includes("string"));
		assert.ok(kinds.includes("void"));
	});

	it("should define collection types", () => {
		const typeSchema = airSchema.definitions.type;
		const kinds = typeSchema.oneOf.map((s: any) => s.properties?.kind?.const).filter(Boolean);

		assert.ok(kinds.includes("set"));
		assert.ok(kinds.includes("list"));
		assert.ok(kinds.includes("map"));
		assert.ok(kinds.includes("option"));
	});

	it("should define function and opaque types", () => {
		const typeSchema = airSchema.definitions.type;
		const kinds = typeSchema.oneOf.map((s: any) => s.properties?.kind?.const).filter(Boolean);

		assert.ok(kinds.includes("fn"));
		assert.ok(kinds.includes("opaque"));
		assert.ok(kinds.includes("ref"));
	});
});

describe("Expression Schema Definitions", () => {
	it("should define AIR expressions", () => {
		const exprSchema = airSchema.definitions.expr;
		assert.ok(exprSchema.oneOf);

		const kinds = exprSchema.oneOf.map((s: any) => s.properties?.kind?.const).filter(Boolean);
		assert.ok(kinds.includes("lit"));
		assert.ok(kinds.includes("ref"));
		assert.ok(kinds.includes("var"));
		assert.ok(kinds.includes("call"));
		assert.ok(kinds.includes("if"));
		assert.ok(kinds.includes("let"));
		assert.ok(kinds.includes("airRef"));
		assert.ok(kinds.includes("predicate"));
	});

	it("should not include CIR expressions in AIR schema", () => {
		const exprSchema = airSchema.definitions.expr;
		const kinds = exprSchema.oneOf.map((s: any) => s.properties?.kind?.const).filter(Boolean);

		assert.ok(!kinds.includes("lambda"));
		assert.ok(!kinds.includes("callExpr"));
		assert.ok(!kinds.includes("fix"));
	});
});

describe("LIR Schema Definitions", () => {
	describe("Instruction schemas", () => {
		it("should define all instruction types in blocks", () => {
			// LIR blocks contain instructions
			const blockSchema = lirSchema.properties.blocks.items;
			assert.ok(blockSchema.properties.instructions);
		});
	});

	describe("Terminator schemas", () => {
		it("should define terminator in block schema", () => {
			const blockSchema = lirSchema.properties.blocks.items;
			assert.ok(blockSchema.properties.terminator);
		});
	});
});

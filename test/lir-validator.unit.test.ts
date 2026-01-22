// CAIRS LIR Validator Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { validateLIR } from "../src/validator.js";
import type { LirBlock } from "../src/types.js";

// Helper to create LIR document with new node-based structure
function makeLIRDoc(blocks: LirBlock[], entry: string, extras?: Record<string, unknown>) {
	return {
		version: "1.0.0",
		...extras,
		nodes: [{ id: "main", blocks, entry }],
		result: "main",
	};
}

describe("LIR Validation", () => {
	it("should validate a minimal LIR document with single block", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "return" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.errors.length, 0);
	});

	it("should validate LIR document with jump terminator", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "entry",
					instructions: [],
					terminator: { kind: "jump", to: "exit" },
				},
				{
					id: "exit",
					instructions: [],
					terminator: { kind: "return" },
				},
			],
			"entry",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate LIR document with branch terminator", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "entry",
					instructions: [],
					terminator: { kind: "branch", cond: "x", then: "then", else: "else" },
				},
				{
					id: "then",
					instructions: [],
					terminator: { kind: "return" },
				},
				{
					id: "else",
					instructions: [],
					terminator: { kind: "return" },
				},
			],
			"entry",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate LIR document with assign instruction", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [
						{
							kind: "assign",
							target: "x",
							value: { kind: "lit", type: { kind: "int" }, value: 42 },
						},
					],
					terminator: { kind: "return", value: "x" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate LIR document with op instruction", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [
						{
							kind: "op",
							target: "result",
							ns: "int",
							name: "add",
							args: ["a", "b"],
						},
					],
					terminator: { kind: "return", value: "result" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate LIR document with phi instruction", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [
						{
							kind: "phi",
							target: "x",
							sources: [
								{ block: "bb1", id: "x1" },
								{ block: "bb2", id: "x2" },
							],
						},
					],
					terminator: { kind: "return", value: "x" },
				},
				{
					id: "bb1",
					instructions: [],
					terminator: { kind: "jump", to: "bb0" },
				},
				{
					id: "bb2",
					instructions: [],
					terminator: { kind: "jump", to: "bb0" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate LIR document with effect instruction", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [
						{
							kind: "effect",
							op: "print",
							args: ["msg"],
						},
					],
					terminator: { kind: "return" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate LIR document with assignRef instruction", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [
						{
							kind: "assignRef",
							target: "cell",
							value: "x",
						},
					],
					terminator: { kind: "return" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should validate LIR document with exit terminator", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "exit" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should reject LIR document with missing version", () => {
		const doc = {
			nodes: [
				{
					id: "main",
					blocks: [
						{
							id: "bb0",
							instructions: [],
							terminator: { kind: "return" },
						},
					],
					entry: "bb0",
				},
			],
			result: "main",
		};
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject LIR document with duplicate block IDs", () => {
		const doc = makeLIRDoc(
			[
				{ id: "bb0", instructions: [], terminator: { kind: "return" } },
				{ id: "bb0", instructions: [], terminator: { kind: "return" } },
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.message.includes("Duplicate")));
	});

	it("should reject LIR document with non-existent entry block", () => {
		const doc = makeLIRDoc(
			[{ id: "bb0", instructions: [], terminator: { kind: "return" } }],
			"nonexistent",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.length > 0);
	});

	it("should reject LIR document with jump to non-existent block", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "jump", to: "missing" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject LIR document with branch to non-existent then block", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "branch", cond: "x", then: "missing", else: "bb0" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject LIR document with branch to non-existent else block", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "branch", cond: "x", then: "bb0", else: "missing" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject LIR block with missing terminator", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [],
					terminator: undefined as unknown as { kind: "jump" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject LIR instruction with unknown kind", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [{ kind: "unknown" as const, target: "x" }],
					terminator: { kind: "return" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject LIR terminator with unknown kind", () => {
		const doc = makeLIRDoc(
			[
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "unknown" as const, to: "bb0" },
				},
			],
			"bb0",
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should validate LIR document with capabilities", () => {
		const doc = makeLIRDoc(
			[{ id: "bb0", instructions: [], terminator: { kind: "return" } }],
			"bb0",
			{ capabilities: ["eir", "effects"] },
		);
		const result = validateLIR(doc);
		assert.strictEqual(result.valid, true);
	});
});

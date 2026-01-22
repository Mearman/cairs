// CAIRS LIR Lowering Tests
// Tests for EIR to LIR conversion

import { describe, it } from "node:test";
import assert from "node:assert";
import { lowerEIRtoLIR } from "../src/lir/lower.js";
import type { EIRDocument, LirBlock } from "../src/types.js";
import { intType, isBlockNode } from "../src/types.js";

// Helper to create minimal EIRDocument
function makeEIR(nodes: EIRDocument["nodes"], result: string, capabilities?: string[]): EIRDocument {
	const doc: EIRDocument = {
		version: "0.1.0",
		nodes,
		result,
		airDefs: [],
	};
	if (capabilities) {
		doc.capabilities = capabilities;
	}
	return doc;
}

// Helper to extract blocks from lowered LIR
function getBlocks(lir: ReturnType<typeof lowerEIRtoLIR>): LirBlock[] {
	const node = lir.nodes.find((n) => n.id === lir.result);
	if (node && isBlockNode(node)) {
		return node.blocks;
	}
	return [];
}

// Helper to get entry from lowered LIR
function getEntry(lir: ReturnType<typeof lowerEIRtoLIR>): string | undefined {
	const node = lir.nodes.find((n) => n.id === lir.result);
	if (node && isBlockNode(node)) {
		return node.entry;
	}
	return undefined;
}

describe("lowerEIRtoLIR", () => {
	describe("basic expressions", () => {
		it("should lower a literal expression", () => {
			const eir = makeEIR(
				[
					{
						id: "n0",
						expr: { kind: "lit", type: intType, value: 42 },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			assert.strictEqual(lir.version, "0.1.0");
			assert.ok(blocks.length > 0);
			assert.ok(getEntry(lir));
		});

		it("should lower a variable expression", () => {
			const eir = makeEIR(
				[
					{
						id: "n0",
						expr: { kind: "var", name: "x" },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			assert.ok(blocks.length > 0);
		});

		it("should lower an operator call", () => {
			const eir = makeEIR(
				[
					{
						id: "n0",
						expr: { kind: "call", ns: "math", name: "add", args: ["a", "b"] },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			// Should have at least one block with an op instruction
			const hasOp = blocks.some((b) =>
				b.instructions.some((i) => i.kind === "op"),
			);
			assert.ok(hasOp);
		});
	});

	describe("control flow", () => {
		it("should lower if expression to branch", () => {
			const eir = makeEIR(
				[
					{
						id: "cond",
						expr: { kind: "var", name: "c" },
					},
					{
						id: "then",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "else",
						expr: { kind: "lit", type: intType, value: 0 },
					},
					{
						id: "n0",
						expr: { kind: "if", type: intType, cond: "cond", then: "then", else: "else" },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			// Should have branch terminator
			const hasBranch = blocks.some(
				(b) => b.terminator?.kind === "branch",
			);
			assert.ok(hasBranch);
		});

		it("should lower while loop", () => {
			const eir = makeEIR(
				[
					{
						id: "cond",
						expr: { kind: "var", name: "c" },
					},
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "n0",
						expr: { kind: "while", cond: "cond", body: "body" },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			// Should have branch terminator (for loop condition)
			const hasBranch = blocks.some(
				(b) => b.terminator?.kind === "branch",
			);
			assert.ok(hasBranch);

			// Should have jump back to header (for loop continuation)
			const hasJump = blocks.some(
				(b) => b.terminator?.kind === "jump",
			);
			assert.ok(hasJump);
		});

		it("should lower for loop", () => {
			const eir = makeEIR(
				[
					{
						id: "init",
						expr: { kind: "lit", type: intType, value: 0 },
					},
					{
						id: "cond",
						expr: { kind: "var", name: "c" },
					},
					{
						id: "update",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "n0",
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
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			// Should have multiple blocks for init, header, body, update, exit
			assert.ok(blocks.length >= 3);
		});
	});

	describe("sequence expressions", () => {
		it("should lower seq expression", () => {
			const eir = makeEIR(
				[
					{
						id: "first",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "second",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "n0",
						expr: { kind: "seq", first: "first", then: "second" },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			assert.ok(blocks.length > 0);
		});
	});

	describe("assignment", () => {
		it("should lower assign expression", () => {
			const eir = makeEIR(
				[
					{
						id: "val",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "n0",
						expr: { kind: "assign", target: "x", value: "val" },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			// Should have assign instruction
			const hasAssign = blocks.some((b) =>
				b.instructions.some((i) => i.kind === "assign"),
			);
			assert.ok(hasAssign);
		});
	});

	describe("effects", () => {
		it("should lower effect expression", () => {
			const eir = makeEIR(
				[
					{
						id: "arg",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "n0",
						expr: { kind: "effect", op: "print", args: ["arg"] },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			// Should have effect instruction
			const hasEffect = blocks.some((b) =>
				b.instructions.some((i) => i.kind === "effect"),
			);
			assert.ok(hasEffect);
		});
	});

	describe("capabilities preservation", () => {
		it("should preserve capabilities from EIR", () => {
			const eir = makeEIR(
				[
					{
						id: "n0",
						expr: { kind: "lit", type: intType, value: 42 },
					},
				],
				"n0",
				["io", "state"],
			);

			const lir = lowerEIRtoLIR(eir);

			assert.deepStrictEqual(lir.capabilities, ["io", "state"]);
		});

		it("should not add capabilities if not present in EIR", () => {
			const eir = makeEIR(
				[
					{
						id: "n0",
						expr: { kind: "lit", type: intType, value: 42 },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);

			assert.strictEqual(lir.capabilities, undefined);
		});
	});

	describe("error handling", () => {
		it("should throw on missing result node", () => {
			const eir = makeEIR([], "missing");

			assert.throws(
				() => lowerEIRtoLIR(eir),
				/Result node not found/,
			);
		});
	});

	describe("let bindings", () => {
		it("should lower let expression", () => {
			const eir = makeEIR(
				[
					{
						id: "val",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "body",
						expr: { kind: "var", name: "x" },
					},
					{
						id: "n0",
						expr: { kind: "let", name: "x", value: "val", body: "body" },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			assert.ok(blocks.length > 0);
		});
	});

	describe("reference expressions", () => {
		it("should lower ref expression", () => {
			const eir = makeEIR(
				[
					{
						id: "target",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "n0",
						expr: { kind: "ref", id: "target" },
					},
				],
				"n0",
			);

			const lir = lowerEIRtoLIR(eir);
			const blocks = getBlocks(lir);

			// Should have assign instruction for the ref
			const hasAssign = blocks.some((b) =>
				b.instructions.some((i) => i.kind === "assign"),
			);
			assert.ok(hasAssign);
		});
	});
});

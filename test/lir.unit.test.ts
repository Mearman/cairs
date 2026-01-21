// CAIRS LIR Evaluation Unit Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { evaluateLIR } from "../src/lir/evaluator.js";
import { createCoreRegistry } from "../src/domains/core.js";
import { createDefaultEffectRegistry } from "../src/effects.js";
import { type LIRDocument } from "../src/types.js";
import { isError } from "../src/types.js";

describe("LIR Evaluation", () => {
	const registry = createCoreRegistry();
	const effects = createDefaultEffectRegistry();

	it("should evaluate simple return block", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "return" },
				},
			],
			entry: "bb0",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "void");
	});

	it("should evaluate block with assign instruction", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
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
			entry: "bb0",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 42);
	});

	it("should evaluate block with op instruction", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [
						{
							kind: "assign",
							target: "a",
							value: { kind: "lit", type: { kind: "int" }, value: 10 },
						},
						{
							kind: "assign",
							target: "b",
							value: { kind: "lit", type: { kind: "int" }, value: 5 },
						},
						{
							kind: "op",
							target: "result",
							ns: "core",
							name: "add",
							args: ["a", "b"],
						},
					],
					terminator: { kind: "return", value: "result" },
				},
			],
			entry: "bb0",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 15);
	});

	it("should evaluate jump between blocks", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "entry",
					instructions: [
						{
							kind: "assign",
							target: "x",
							value: { kind: "lit", type: { kind: "int" }, value: 42 },
						},
					],
					terminator: { kind: "jump", to: "exit" },
				},
				{
					id: "exit",
					instructions: [],
					terminator: { kind: "return", value: "x" },
				},
			],
			entry: "entry",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 42);
	});

	it("should evaluate branch with true condition", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "entry",
					instructions: [
						{
							kind: "assign",
							target: "cond",
							value: { kind: "lit", type: { kind: "bool" }, value: true },
						},
					],
					terminator: { kind: "branch", cond: "cond", then: "then", else: "else" },
				},
				{
					id: "then",
					instructions: [
						{
							kind: "assign",
							target: "result",
							value: { kind: "lit", type: { kind: "int" }, value: 1 },
						},
					],
					terminator: { kind: "return", value: "result" },
				},
				{
					id: "else",
					instructions: [
						{
							kind: "assign",
							target: "result",
							value: { kind: "lit", type: { kind: "int" }, value: 2 },
						},
					],
					terminator: { kind: "return", value: "result" },
				},
			],
			entry: "entry",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 1);
	});

	it("should evaluate branch with false condition", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "entry",
					instructions: [
						{
							kind: "assign",
							target: "cond",
							value: { kind: "lit", type: { kind: "bool" }, value: false },
						},
					],
					terminator: { kind: "branch", cond: "cond", then: "then", else: "else" },
				},
				{
					id: "then",
					instructions: [
						{
							kind: "assign",
							target: "result",
							value: { kind: "lit", type: { kind: "int" }, value: 1 },
						},
					],
					terminator: { kind: "return", value: "result" },
				},
				{
					id: "else",
					instructions: [
						{
							kind: "assign",
							target: "result",
							value: { kind: "lit", type: { kind: "int" }, value: 2 },
						},
					],
					terminator: { kind: "return", value: "result" },
				},
			],
			entry: "entry",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 2);
	});

	it("should evaluate phi instruction", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [
						// Set up one of the phi sources first
						{
							kind: "assign",
							target: "x1",
							value: { kind: "lit", type: { kind: "int" }, value: 10 },
						},
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
			],
			entry: "bb0",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		// Phi should take first available source (x1 which is set to 10)
		assert.strictEqual(result.kind, "int");
		assert.strictEqual((result as { kind: "int"; value: number }).value, 10);
	});

	it("should evaluate effect instruction", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [
						{
							kind: "assign",
							target: "msg",
							value: { kind: "lit", type: { kind: "string" }, value: "hello" },
						},
						{
							kind: "effect",
							op: "print",
							args: ["msg"],
						},
					],
					terminator: { kind: "return" },
				},
			],
			entry: "bb0",
		};
		const { result, state } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "void");
		assert.strictEqual(state.effects.length, 1);
		assert.strictEqual(state.effects[0]?.op, "print");
	});

	it("should evaluate exit terminator", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "exit" },
				},
			],
			entry: "bb0",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(result.kind, "void");
	});

	it("should handle non-existent entry block", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "return" },
				},
			],
			entry: "nonexistent",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(isError(result), true);
	});

	it("should handle jump to non-existent block", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [],
					terminator: { kind: "jump", to: "missing" },
				},
			],
			entry: "bb0",
		};
		const { result } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(isError(result), true);
	});

	it("should enforce max steps limit", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [],
					// Infinite loop
					terminator: { kind: "jump", to: "bb0" },
				},
			],
			entry: "bb0",
		};
		const { result } = evaluateLIR(doc, registry, effects, undefined, { maxSteps: 5 });
		assert.strictEqual(isError(result), true);
	});

	it("should track effects in state", () => {
		const doc: LIRDocument = {
			version: "1.0.0",
			blocks: [
				{
					id: "bb0",
					instructions: [
						{
							kind: "assign",
							target: "msg",
							value: { kind: "lit", type: { kind: "string" }, value: "test" },
						},
						{
							kind: "effect",
							op: "print",
							args: ["msg"],
						},
					],
					terminator: { kind: "return" },
				},
			],
			entry: "bb0",
		};
		const { state } = evaluateLIR(doc, registry, effects);
		assert.strictEqual(state.effects.length, 1);
		assert.deepStrictEqual(state.effects[0]?.args, [
			{ kind: "string", value: "test" },
		]);
	});
});

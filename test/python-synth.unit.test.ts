// CAIRS Python Synthesizer Tests
// Unit tests for synthesizePython functionality

import assert from "node:assert";
import { describe, it } from "node:test";
import { synthesizePython } from "../src/synth/python.js";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	LIRDocument,
} from "../src/types.js";

describe("synthesizePython", () => {
	describe("AIR documents", () => {
		it("should synthesize simple arithmetic", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "lit1",
						expr: { kind: "lit", type: { kind: "int" }, value: 5 },
					},
					{
						id: "lit2",
						expr: { kind: "lit", type: { kind: "int" }, value: 3 },
					},
					{
						id: "result",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["lit1", "lit2"],
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_lit1 = 5/);
			assert.match(python, /v_lit2 = 3/);
			assert.match(python, /v_result = \(v_lit1 \+ v_lit2\)/);
			assert.match(python, /print\(v_result\)/);
		});

		it("should synthesize boolean operations", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "t",
						expr: { kind: "lit", type: { kind: "bool" }, value: true },
					},
					{
						id: "f",
						expr: { kind: "lit", type: { kind: "bool" }, value: false },
					},
					{
						id: "result",
						expr: {
							kind: "call",
							ns: "bool",
							name: "and",
							args: ["t", "f"],
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_t = True/);
			assert.match(python, /v_f = False/);
			assert.match(python, /v_result = \(v_t and v_f\)/);
		});

		it("should synthesize conditionals", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "cond",
						expr: { kind: "lit", type: { kind: "bool" }, value: true },
					},
					{
						id: "then",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "else",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
					{
						id: "result",
						expr: {
							kind: "if",
							cond: "cond",
							then: "then",
							else: "else",
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_result = \(v_then if v_cond else v_else\)/);
		});

		it("should synthesize AIR definitions as functions", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "math",
						name: "square",
						params: ["x"],
						body: {
							kind: "call",
							ns: "core",
							name: "mul",
							args: [
								{ kind: "var", name: "x" },
								{ kind: "var", name: "x" },
							],
						},
					},
				],
				nodes: [
					{
						id: "n",
						expr: { kind: "lit", type: { kind: "int" }, value: 5 },
					},
					{
						id: "result",
						expr: {
							kind: "airRef",
							ns: "math",
							name: "square",
							args: ["n"],
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /def air_math_square\(x\):/);
			assert.match(python, /return \(x \* x\)/);
			assert.match(python, /air_math_square\(v_n\)/);
		});
	});

	describe("CIR documents", () => {
		it("should synthesize lambda expressions", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "identity",
						expr: {
							kind: "lambda",
							params: ["x"],
							body: "x",
						},
					},
					{
						id: "val",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
					{
						id: "result",
						expr: {
							kind: "callExpr",
							fn: "identity",
							args: ["val"],
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_identity = \(lambda x: v_x\)/);
			assert.match(python, /v_result = v_identity\(v_val\)/);
		});

		it("should synthesize let bindings", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "five",
						expr: { kind: "lit", type: { kind: "int" }, value: 5 },
					},
					{
						id: "result",
						expr: {
							kind: "let",
							name: "x",
							value: "five",
							body: "x",
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_result = \(lambda x: v_x\)\(v_five\)/);
		});
	});

	describe("EIR documents", () => {
		it("should synthesize sequencing", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "first",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "second",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
					{
						id: "result",
						expr: {
							kind: "seq",
							first: "first",
							then: "second",
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_result = \(lambda _: v_second\)\(v_first\)/);
		});

		it("should synthesize assignment", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "val",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
					{
						id: "assign1",
						expr: {
							kind: "assign",
							target: "x",
							value: "val",
						},
					},
					{
						id: "result",
						expr: { kind: "lit", type: { kind: "void" }, value: null },
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(python, /# Mutable cells/);
			assert.match(python, /\{"x": v_val\}/);
		});

		it("should synthesize while loops", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "cond",
						expr: { kind: "lit", type: { kind: "bool" }, value: false },
					},
					{
						id: "body",
						expr: { kind: "lit", type: { kind: "void" }, value: null },
					},
					{
						id: "result",
						expr: {
							kind: "while",
							cond: "cond",
							body: "body",
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(
				python,
				/\(lambda _: \(v_body, None\)\[1\] if v_cond else None\)\(None\)/,
			);
		});

		it("should synthesize iter loops", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "items",
						expr: { kind: "lit", type: { kind: "list", of: { kind: "int" } }, value: [1, 2, 3] },
					},
					{
						id: "body",
						expr: { kind: "var", name: "x" },
					},
					{
						id: "result",
						expr: {
							kind: "iter",
							var: "x",
							iter: "items",
							body: "body",
						},
					},
				],
				result: "result",
			};

			const python = synthesizePython(doc);
			assert.match(
				python,
				/\[\(lambda x: v_body\)\(item\) for item in v_items\]\[-1\]/,
			);
		});
	});

	describe("LIR documents", () => {
		it("should synthesize CFG with blocks", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [
									{
										kind: "assign",
										target: "x",
										value: { kind: "lit", type: { kind: "int" }, value: 5 },
									},
								],
								terminator: { kind: "return", value: "x" },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};

			const python = synthesizePython(doc);
			assert.match(python, /blocks = \{/);
			assert.match(python, /"entry":/);
			assert.match(python, /"instructions":/);
			assert.match(python, /"terminator":/);
			assert.match(python, /def execute_lir\(blocks, entry\):/);
			assert.match(python, /result = execute_lir\(blocks, "entry"\)/);
		});

		it("should synthesize branch terminators", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "header",
								instructions: [
									{
										kind: "assign",
										target: "cond",
										value: { kind: "lit", type: { kind: "bool" }, value: true },
									},
								],
								terminator: {
									kind: "branch",
									cond: "cond",
									then: "thenBlock",
									else: "elseBlock",
								},
							},
							{
								id: "thenBlock",
								instructions: [],
								terminator: { kind: "return" },
							},
							{
								id: "elseBlock",
								instructions: [],
								terminator: { kind: "return" },
							},
						],
						entry: "header",
					},
				],
				result: "main",
			};

			const python = synthesizePython(doc);
			assert.match(
				python,
				/current = term\[.*then.*\] if vars\[term\[.*cond.*\]\] else term\[.*else.*\]/,
			);
		});

		it("should synthesize phi nodes", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "merge",
								instructions: [
									{
										kind: "phi",
										target: "x",
										sources: [
											{ block: "pred1", id: "x1" },
											{ block: "pred2", id: "x2" },
										],
									},
								],
								terminator: { kind: "return", value: "x" },
							},
						],
						entry: "merge",
					},
				],
				result: "main",
			};

			const python = synthesizePython(doc);
			assert.match(python, /elif kind == 'phi':/);
			assert.match(python, /for s in inst\['sources'\]:/);
			assert.match(python, /if s\['block'\] == predecessor:/);
		});
	});

	describe("Operator mappings", () => {
		it("should map core arithmetic operators", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
					{
						id: "add",
						expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
					},
					{
						id: "sub",
						expr: { kind: "call", ns: "core", name: "sub", args: ["a", "b"] },
					},
					{
						id: "mul",
						expr: { kind: "call", ns: "core", name: "mul", args: ["a", "b"] },
					},
					{
						id: "div",
						expr: { kind: "call", ns: "core", name: "div", args: ["a", "b"] },
					},
					{
						id: "mod",
						expr: { kind: "call", ns: "core", name: "mod", args: ["a", "b"] },
					},
					{
						id: "pow",
						expr: { kind: "call", ns: "core", name: "pow", args: ["a", "b"] },
					},
				],
				result: "pow",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_add = \(v_a \+ v_b\)/);
			assert.match(python, /v_sub = \(v_a - v_b\)/);
			assert.match(python, /v_mul = \(v_a \* v_b\)/);
			assert.match(python, /int\(v_a \/\/ v_b\)/); // div custom impl
			assert.match(python, /v_mod = \(v_a % v_b\)/);
			assert.match(python, /v_pow = \(v_a \*\* v_b\)/);
		});

		it("should map comparison operators", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
					{
						id: "lt",
						expr: { kind: "call", ns: "core", name: "lt", args: ["a", "b"] },
					},
				],
				result: "lt",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_lt = \(v_a < v_b\)/);
		});

		it("should map boolean operators", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
					{ id: "b", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
					{
						id: "and",
						expr: { kind: "call", ns: "bool", name: "and", args: ["a", "b"] },
					},
					{
						id: "or",
						expr: { kind: "call", ns: "bool", name: "or", args: ["a", "b"] },
					},
					{
						id: "not",
						expr: { kind: "call", ns: "bool", name: "not", args: ["a"] },
					},
				],
				result: "not",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_and = \(v_a and v_b\)/);
			assert.match(python, /v_or = \(v_a or v_b\)/);
			assert.match(python, /v_not = \(not v_a\)/);
		});

		it("should map list operators", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "lst",
						expr: { kind: "lit", type: { kind: "list", of: { kind: "int" } }, value: [1, 2, 3] },
					},
					{
						id: "len",
						expr: { kind: "call", ns: "list", name: "length", args: ["lst"] },
					},
				],
				result: "len",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_len = len\(v_lst\)/);
		});
	});

	describe("Options", () => {
		it("should include module name in comments", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "r", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				],
				result: "r",
			};

			const python = synthesizePython(doc, { moduleName: "test_module" });
			assert.match(python, /# Module: test_module/);
		});
	});

	describe("Error handling", () => {
		it("should throw on unsupported operator", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "result",
						expr: {
							kind: "call",
							ns: "unknown",
							name: "foo",
							args: [],
						},
					},
				],
				result: "result",
			};

			assert.throws(
				() => synthesizePython(doc),
				/Unsupported operator: unknown:foo/,
			);
		});

		it("should throw on unrecognized document format", () => {
			const doc = {} as unknown;

			assert.throws(
				() => synthesizePython(doc as AIRDocument),
				/Unrecognized document format/,
			);
		});
	});

	describe("Value formatting", () => {
		it("should format null as None", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "n", expr: { kind: "lit", type: { kind: "void" }, value: null } },
				],
				result: "n",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_n = None/);
		});

		it("should format booleans as True/False", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "t", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
					{ id: "f", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				],
				result: "t",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_t = True/);
			assert.match(python, /v_f = False/);
		});

		it("should format strings with quotes", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "s", expr: { kind: "lit", type: { kind: "string" }, value: "hello" } },
				],
				result: "s",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_s = "hello"/);
		});

		it("should format lists", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "lst",
						expr: { kind: "lit", type: { kind: "list", of: { kind: "int" } }, value: [1, 2, 3] },
					},
				],
				result: "lst",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_lst = \[1, 2, 3\]/);
		});

		it("should format sets", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "st",
						expr: { kind: "lit", type: { kind: "set", of: { kind: "string" } }, value: { kind: "set", value: new Set(["a", "b"]) } },
					},
				],
				result: "st",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_st = set\(\["a", "b"\]\)/);
		});
	});

	describe("Node ID sanitization", () => {
		it("should sanitize special characters in node IDs", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "node-with-dashes",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "node.with.dots",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
					{
						id: "node:with:colons",
						expr: { kind: "lit", type: { kind: "int" }, value: 3 },
					},
				],
				result: "node:with:colons",
			};

			const python = synthesizePython(doc);
			assert.match(python, /v_node_with_dashes = 1/);
			assert.match(python, /v_node_with_dots = 2/);
			assert.match(python, /v_node_with_colons = 3/);
		});
	});
});

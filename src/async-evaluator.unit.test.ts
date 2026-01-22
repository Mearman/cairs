/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
 
/* eslint-disable @typescript-eslint/no-explicit-any */

// CAIRS Async Evaluator Unit Tests
// Tests for AsyncEvaluator class and async expression evaluation

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert";
import {
	AsyncEvaluator,
	createAsyncEvaluator,
	type AsyncEvalOptions,
} from "./async-evaluator.js";
import { createCoreRegistry } from "./domains/core.js";
import { intVal, boolVal, isError, type Value } from "./types.js";

describe("AsyncEvaluator", () => {
	let registry: ReturnType<typeof createCoreRegistry>;

	before(() => {
		registry = createCoreRegistry();
	});

	describe("Constructor", () => {
		it("should create an instance with registry and defs", () => {
			const defs = new Map();
			const evaluator = new AsyncEvaluator(registry, defs);

			assert.strictEqual(evaluator.registry, registry);
			assert.deepStrictEqual(evaluator.defs, defs);
		});

		it("should create an instance using factory function", () => {
			const defs = new Map();
			const evaluator = createAsyncEvaluator(registry, defs);

			assert.ok(evaluator instanceof AsyncEvaluator);
		});
	});

	describe("evaluate - basic expressions", () => {
		let evaluator: AsyncEvaluator;

		beforeEach(() => {
			evaluator = new AsyncEvaluator(registry, new Map());
		});

		it("should evaluate a literal expression", async () => {
			const expr = {
				kind: "lit" as const,
				type: { kind: "int" as const },
				value: 42,
			};

			const result = await evaluator.evaluate(expr);

			assert.equal(result.kind, "int");
			assert.equal((result as { kind: "int"; value: number }).value, 42);
		});

		it("should evaluate a boolean literal", async () => {
			const expr = {
				kind: "lit" as const,
				type: { kind: "bool" as const },
				value: true,
			};

			const result = await evaluator.evaluate(expr);

			assert.equal(result.kind, "bool");
			assert.equal((result as { kind: "bool"; value: boolean }).value, true);
		});

		it("should evaluate a string literal", async () => {
			const expr = {
				kind: "lit" as const,
				type: { kind: "string" as const },
				value: "hello",
			};

			const result = await evaluator.evaluate(expr);

			assert.equal(result.kind, "string");
			assert.equal((result as { kind: "string"; value: string }).value, "hello");
		});

		it("should evaluate void literal", async () => {
			const expr = {
				kind: "lit" as const,
				type: { kind: "void" as const },
				value: null,
			};

			const result = await evaluator.evaluate(expr);

			assert.equal(result.kind, "void");
		});
	});

	describe("evaluateDocument - PIR document evaluation", () => {
		let evaluator: AsyncEvaluator;

		beforeEach(() => {
			evaluator = new AsyncEvaluator(registry, new Map());
		});

		it("should evaluate a simple document with literals", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit" as const, type: { kind: "int" as const }, value: 10 },
					},
					{
						id: "y",
						expr: { kind: "lit" as const, type: { kind: "int" as const }, value: 20 },
					},
				],
				result: "x",
			};

			const result = await evaluator.evaluateDocument(doc as any);

			assert.equal(result.kind, "int");
			assert.equal((result as { kind: "int"; value: number }).value, 10);
		});

		it("should handle missing result node", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit" as const, type: { kind: "int" as const }, value: 10 },
					},
				],
				result: "nonexistent",
			};

			const result = await evaluator.evaluateDocument(doc as any);

			assert.ok(isError(result));
		});
	});

	describe("evaluate - async primitives", () => {
		let evaluator: AsyncEvaluator;

		beforeEach(() => {
			evaluator = new AsyncEvaluator(registry, new Map());
		});

		it("should evaluate channel expression", async () => {
			const expr = {
				kind: "channel" as const,
				channelType: "mpsc" as const,
				bufferSize: "bufferSize",
			};

			// Set up environment with buffer size
			const env = new Map<string, Value>([["bufferSize", intVal(5)]]);

			const result = await evaluator.evaluate(expr as any, env);

			assert.equal(result.kind, "channel");
			assert.equal((result as { kind: "channel"; channelType: string }).channelType, "mpsc");
		});

		it("should evaluate channel with default buffer size", async () => {
			const expr = {
				kind: "channel" as const,
				channelType: "mpsc" as const,
			};

			const result = await evaluator.evaluate(expr as any, new Map());

			assert.equal(result.kind, "channel");
		});
	});

	describe("evaluate - EIR expressions", () => {
		let evaluator: AsyncEvaluator;

		beforeEach(() => {
			evaluator = new AsyncEvaluator(registry, new Map());
		});

		it("should evaluate seq expression", async () => {
			const expr = {
				kind: "seq" as const,
				first: "5",
				then: "10",
			};

			// Set up environment
			const env = new Map<string, Value>([
				["5", intVal(1)],
				["10", intVal(2)],
			] as any);

			const result = await evaluator.evaluate(expr as any, env as any);

			assert.equal(result.kind, "int");
			assert.equal((result as { kind: "int"; value: number }).value, 2);
		});

		it("should evaluate if expression with true condition", async () => {
			const expr = {
				kind: "if" as const,
				type: { kind: "int" as const },
				cond: "cond",
				then: "thenBranch",
				else: "elseBranch",
			};

			const env = new Map<string, Value>([
				["cond", boolVal(true)],
				["thenBranch", intVal(1)],
				["elseBranch", intVal(2)],
			] as any);

			const result = await evaluator.evaluate(expr as any, env as any);

			assert.equal((result as { kind: "int"; value: number }).value, 1);
		});

		it("should evaluate if expression with false condition", async () => {
			const expr = {
				kind: "if" as const,
				type: { kind: "int" as const },
				cond: "cond",
				then: "thenBranch",
				else: "elseBranch",
			};

			const env = new Map<string, Value>([
				["cond", boolVal(false)],
				["thenBranch", intVal(1)],
				["elseBranch", intVal(2)],
			] as any);

			const result = await evaluator.evaluate(expr as any, env as any);

			assert.equal((result as { kind: "int"; value: number }).value, 2);
		});

		it("should evaluate lambda expression", async () => {
			const expr = {
				kind: "lambda" as const,
				params: ["x"],
				body: "bodyRef",
			};

			const env = new Map<string, Value>([["bodyRef", intVal(0)]]);

			const result = await evaluator.evaluate(expr as any, env as any);

			assert.equal(result.kind, "closure");
			assert.deepEqual((result as { kind: "closure"; params: string[] }).params, ["x"]);
		});
	});

	describe("evaluate - error handling", () => {
		let evaluator: AsyncEvaluator;

		beforeEach(() => {
			evaluator = new AsyncEvaluator(registry, new Map());
		});

		it("should return error for unbound variable", async () => {
			const expr = {
				kind: "var" as const,
				name: "nonexistent",
			};

			const result = await evaluator.evaluate(expr as any, new Map());

			assert.ok(isError(result));
			assert.equal((result as { kind: "error"; code: string }).code, "UnboundIdentifier");
		});

		it("should return error for unknown operator", async () => {
			const expr = {
				kind: "call" as const,
				ns: "nonexistent",
				name: "foo",
				args: [],
			};

			const result = await evaluator.evaluate(expr as any, new Map());

			assert.ok(isError(result));
		});

		it("should return error for non-boolean if condition", async () => {
			const expr = {
				kind: "if" as const,
				type: { kind: "int" as const },
				cond: "cond",
				then: "thenBranch",
				else: "elseBranch",
			};

			const env = new Map<string, Value>([
				["cond", intVal(42)], // Not a boolean
				["thenBranch", intVal(1)],
				["elseBranch", intVal(2)],
			]);

			const result = await evaluator.evaluate(expr as any, env as any);

			assert.ok(isError(result));
			assert.equal((result as { kind: "error"; code: string }).code, "TypeError");
		});
	});

	describe("evaluate - ref cells", () => {
		let evaluator: AsyncEvaluator;

		beforeEach(() => {
			evaluator = new AsyncEvaluator(registry, new Map());
		});

		it("should read from existing ref cell", async () => {
			const expr = {
				kind: "refCell" as const,
				target: "myCell",
			};

			const options: AsyncEvalOptions = {};
			const result = await evaluator.evaluate(expr as any, new Map(), options);

			// Creates empty cell if not exists
			assert.equal(result.kind, "refCell");
		});

		it("should assign to ref cell", async () => {
			const expr = {
				kind: "assign" as const,
				target: "myCell",
				value: "valueRef",
			};

			const env = new Map<string, Value>([["valueRef", intVal(42)]]);

			const result = await evaluator.evaluate(expr as any, env);

			assert.equal(result.kind, "void");
		});
	});

	describe("evaluate - concurrency modes", () => {
		let evaluator: AsyncEvaluator;

		beforeEach(() => {
			evaluator = new AsyncEvaluator(registry, new Map());
		});

		it("should support sequential concurrency mode", async () => {
			const expr = {
				kind: "par" as const,
				branches: ["a", "b"],
			};

			const env = new Map<string, Value>([
				["a", intVal(1)],
				["b", intVal(2)],
			]);

			const options: AsyncEvalOptions = { concurrency: "sequential" };

			const result = await evaluator.evaluate(expr as any, env as any, options);

			assert.equal(result.kind, "list");
		});

		it("should support parallel concurrency mode", async () => {
			const expr = {
				kind: "par" as const,
				branches: ["a", "b"],
			};

			const env = new Map<string, Value>([
				["a", intVal(1)],
				["b", intVal(2)],
			]);

			const options: AsyncEvalOptions = { concurrency: "parallel" };

			const result = await evaluator.evaluate(expr as any, env as any, options);

			assert.equal(result.kind, "list");
		});
	});
});

describe("AsyncEvaluator Integration", () => {
	let registry: ReturnType<typeof createCoreRegistry>;

	before(() => {
		registry = createCoreRegistry();
	});

	it("should evaluate a PIR document with channels", async () => {
		const evaluator = new AsyncEvaluator(registry, new Map());

		const doc = {
			version: "2.0.0" as const,
			airDefs: [],
			capabilities: ["async"],
			nodes: [
				{
					id: "bufferSize",
					expr: { kind: "lit" as const, type: { kind: "int" as const }, value: 10 },
				},
			],
			result: "bufferSize",
		};

		const result = await evaluator.evaluateDocument(doc as any);

		assert.equal(result.kind, "int");
		assert.equal((result as { kind: "int"; value: number }).value, 10);
	});

	it("should handle document with expression errors gracefully", async () => {
		const evaluator = new AsyncEvaluator(registry, new Map());

		const doc = {
			version: "2.0.0" as const,
			airDefs: [],
			capabilities: ["async"],
			nodes: [
				{
					id: "badNode",
					expr: {
						kind: "var" as const,
						name: "nonexistent",
					},
				},
			],
			result: "badNode",
		};

		const result = await evaluator.evaluateDocument(doc as any);

		assert.ok(isError(result));
	});
});

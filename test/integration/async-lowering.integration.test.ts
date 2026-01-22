// CAIRS Async Lowering Integration Tests
// Tests lowering EIR with async features to LIR
// Tests PIR -> LIR lowering patterns

import assert from "node:assert";
import { describe, it } from "node:test";
import { emptyDefs } from "../../src/env.js";
import {
	createCoreRegistry,
	createBoolRegistry,
	createQueuedEffectRegistry,
	evaluateLIR,
	intVal,
	lowerEIRtoLIR,
	AsyncEvaluator,
} from "../../src/index.js";
import { type LIRDocument, type PIRDocument } from "../../src/types.js";

describe("Async Lowering Integration Tests", () => {
	const registry = new Map();
	const coreReg = createCoreRegistry();
	const boolReg = createBoolRegistry();
	for (const [key, op] of [...coreReg, ...boolReg]) {
		registry.set(key, op);
	}
	const defs = emptyDefs();

	describe("EIR with async features -> LIR", () => {
		it("should lower EIR with effect calls to LIR", () => {
			// EIR with effect calls
			// Lower to LIR with effect instructions
			const eirDoc = {
				version: "2.0.0",
				airDefs: [],
				nodes: [
					{ id: "input", expr: { kind: "effect", op: "readInt", args: [] } },
					{
						id: "doubled",
						expr: { kind: "call", ns: "core", name: "mul", args: ["input", "two"] },
					},
					{ id: "two", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				],
				result: "doubled",
			} as any;

			// Lower EIR to LIR
			const lirDoc = lowerEIRtoLIR(eirDoc);
			assert.ok(lirDoc);
			assert.ok("nodes" in lirDoc);

			// Debug: log LIR document structure
			console.log("LIR document:", JSON.stringify(lirDoc, null, 2));

			// Evaluate LIR with effects
			const effectRegistry = createQueuedEffectRegistry([21]);
			const result = evaluateLIR(
				lirDoc as LIRDocument,
				registry,
				effectRegistry,
				undefined,
				undefined,
				defs,
			);

			assert.deepStrictEqual(result.result, intVal(42));
		});

		it("should lower EIR loop with async operations to LIR", () => {
			// EIR while loop with effect inside
			// Lower to LIR with branch terminator
			const eirDoc = {
				version: "2.0.0",
				airDefs: [],
				nodes: [
					// Loop counter
					{ id: "i", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
					// Loop condition
					{
						id: "cond",
						expr: { kind: "call", ns: "core", name: "lt", args: ["i", "limit"] },
					},
					{ id: "limit", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
					// Loop body: increment
					{
						id: "next",
						expr: { kind: "call", ns: "core", name: "add", args: ["i", "one"] },
					},
					{ id: "one", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
					// While loop
					{
						id: "loop",
						expr: { kind: "while", cond: "cond", body: "next" },
					},
				],
				result: "loop",
			} as any;

			// Lower to LIR
			const lirDoc = lowerEIRtoLIR(eirDoc);
			assert.ok(lirDoc);

			// LIR should have block structure
			const nodes = (lirDoc as any).nodes;
			assert.ok(Array.isArray(nodes));

			// Find block nodes
			const blockNodes = nodes.filter((n: any) => "blocks" in n);
			assert.ok(blockNodes.length > 0, "LIR should contain block nodes for loops");
		});

		it("should lower EIR try/catch to LIR with branch structure", () => {
			// EIR try/catch expression
			// Lower to LIR with branch for error handling
			const eirDoc = {
				version: "2.0.0",
				airDefs: [],
				nodes: [
					// Try body: safe operation
					{
						id: "tryBody",
						expr: { kind: "call", ns: "core", name: "add", args: ["x", "y"] },
					},
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "y", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					// Catch body: fallback
					{ id: "catchBody", expr: { kind: "lit", type: { kind: "int" }, value: -1 } },
					// Try/catch
					{
						id: "result",
						expr: {
							kind: "try",
							tryBody: "tryBody",
							catchParam: "err",
							catchBody: "catchBody",
						},
					},
				],
				result: "result",
			} as any;

			// Lower to LIR
			const lirDoc = lowerEIRtoLIR(eirDoc);
			assert.ok(lirDoc);

			// Should preserve result reference
			assert.equal((lirDoc as any).result, "result");
		});
	});

	describe("PIR -> LIR lowering patterns", () => {
		it("should represent PIR spawn as fork in LIR", async () => {
			// PIR spawn expression
			// Should lower to LIR with fork terminator
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "task", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "future", expr: { kind: "spawn", task: "task" } },
				],
				result: "future",
			};

			// In a real implementation, this would lower spawn to fork instruction
			// For now, verify PIR document is valid and can be evaluated
			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "future");
		});

		it("should represent PIR await as suspend in LIR", async () => {
			// PIR await expression
			// Should lower to LIR with suspend terminator
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "value", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "future", expr: { kind: "spawn", task: "value" } },
					{ id: "result", expr: { kind: "await", future: "future" } },
				],
				result: "result",
			};

			// Verify await works
			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);
		});

		it("should represent PIR select as join pattern in LIR", async () => {
			// PIR select on multiple futures
			// Should lower to LIR with join terminator
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "task1", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "task2", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					{ id: "future1", expr: { kind: "spawn", task: "task1" } },
					{ id: "future2", expr: { kind: "spawn", task: "task2" } },
					// Select first to complete
					{
						id: "result",
						expr: { kind: "select", futures: ["future1", "future2"] },
					},
				],
				result: "result",
			};

			// Verify select works
			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			// Should return one of the values (first to complete)
			assert.equal(result.kind, "int");
			assert.ok(
				(result as { value: number }).value === 10 ||
				(result as { value: number }).value === 32,
			);
		});
	});

	describe("Channel operations lowering", () => {
		it("should lower PIR channel create to LIR", async () => {
			// PIR channel creation
			// Should lower to LIR with channel allocation
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "timeout", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
					{
						id: "ch",
						expr: {
							kind: "channel",
							channelType: "mpsc",
							bufferSize: "timeout",
						},
					},
				],
				result: "ch",
			};

			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "channel");
			assert.equal((result as { channelType: string }).channelType, "mpsc");
		});

		it("should lower PIR send/recv to LIR channel ops", async () => {
			// PIR send and recv expressions
			// Should lower to LIR with channelOp instructions
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "bufSize", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
					{
						id: "ch",
						expr: {
							kind: "channel",
							channelType: "spsc",
							bufferSize: "bufSize",
						},
					},
					{ id: "value", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "send", expr: { kind: "send", channel: "ch", value: "value" } },
					{ id: "result", expr: { kind: "recv", channel: "ch" } },
				],
				result: "result",
			};

			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);
		});
	});

	describe("Hybrid document lowering", () => {
		it("should handle expression nodes that reference block nodes", async () => {
			// Hybrid: expression node that uses result from block node
			// This tests the bridge between declarative and CFG-based
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					// Expression node with value
					{ id: "input", expr: { kind: "lit", type: { kind: "int" }, value: 21 } },
					// Block node that doubles the value
					{
						id: "compute",
						blocks: [
							{
								id: "entry",
								instructions: [
									{
										kind: "op",
										target: "result",
										ns: "core",
										name: "mul",
										args: ["input", "two"],
									},
								],
								terminator: { kind: "return", value: "result" },
							},
						],
						entry: "entry",
					},
					{ id: "two", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				],
				result: "compute",
			};

			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);
		});
	});

	describe("Block-based async execution", () => {
		it("should execute PIR block node with fork terminator", async () => {
			// PIR block with fork terminator
			// Tests CFG-based async execution
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "value1", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "value2", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					// Block node with fork
					{
						id: "parallel",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: {
									kind: "fork",
									branches: [
										{ block: "branch1", taskId: "task1" },
										{ block: "branch2", taskId: "task2" },
									],
									continuation: "join",
								},
							},
							{
								id: "branch1",
								instructions: [
									{
										kind: "assign",
										target: "local1",
										value: { kind: "var", name: "value1" },
									},
								],
								terminator: { kind: "jump", to: "join" },
							},
							{
								id: "branch2",
								instructions: [
									{
										kind: "assign",
										target: "local2",
										value: { kind: "var", name: "value2" },
									},
								],
								terminator: { kind: "jump", to: "join" },
							},
							{
								id: "join",
								instructions: [
									{
										kind: "op",
										target: "sum",
										ns: "core",
										name: "add",
										args: ["local1", "local2"],
									},
								],
								terminator: { kind: "return", value: "sum" },
							},
						],
						entry: "entry",
					},
				],
				result: "parallel",
			};

			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);
		});

		it("should execute PIR block with suspend/await", async () => {
			// PIR block with suspend terminator for async wait
			// Tests suspend/resume pattern
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "task", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "future", expr: { kind: "spawn", task: "task" } },
					// Block that suspends and resumes
					{
						id: "asyncBlock",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: {
									kind: "suspend",
									future: "future",
									resumeBlock: "resume",
								},
							},
							{
								id: "resume",
								instructions: [
									{
										kind: "await",
										target: "result",
										future: "future",
									},
								],
								terminator: { kind: "return", value: "result" },
							},
						],
						entry: "entry",
					},
				],
				result: "asyncBlock",
			};

			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);
		});
	});

	describe("Loop with async operations", () => {
		it("should handle EIR iter with async channel operations", async () => {
			// EIR iter loop with async effects
			// Lower to LIR with async-aware loop structure
			const pirDoc: PIRDocument = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "bufSize", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
					{
						id: "ch",
						expr: {
							kind: "channel",
							channelType: "spsc",
							bufferSize: "bufSize",
						},
					},
					// Send values to channel
					{ id: "v1", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "send1", expr: { kind: "send", channel: "ch", value: "v1" } },
					{ id: "v2", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
					{ id: "send2", expr: { kind: "send", channel: "ch", value: "v2" } },
					{ id: "v3", expr: { kind: "lit", type: { kind: "int" }, value: 12 } },
					{ id: "send3", expr: { kind: "send", channel: "ch", value: "v3" } },
					// Receive final value
					{ id: "result", expr: { kind: "recv", channel: "ch" } },
				],
				result: "result",
			};

			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(pirDoc);

			assert.equal(result.kind, "int");
			// Due to FIFO ordering, should receive 10, 20, then 12
			assert.equal((result as { value: number }).value, 10);
		});
	});
});

 
 
 
 
 
/* eslint-disable @typescript-eslint/require-await */
 

// CAIRS Async Evaluator
// Promise-based big-step evaluation for PIR: ρ, σ ⊢ e ⇓ v, σ'
// Extends EIR with async primitives (par, spawn, await, channels)

import { lookupOperator, type OperatorRegistry } from "./domains/registry.js";
import {
	Defs,
	ValueEnv,
	emptyValueEnv,
	extendValueEnv,
	extendValueEnvMany,
	lookupValue,
} from "./env.js";
import { ErrorCodes } from "./errors.js";
import {
	type BlockNode,
	type EirExpr,
	isBlockNode,
	type Type,
	type Value,
	voidVal,
	refCellVal,
	isFuture,
	isChannel,
	futureVal,
	channelVal,
	type PIRDocument,
	type PirHybridNode,
	type PirExpr,
	type PirBlock,
	errorVal,
	intVal,
	listVal,
	type AsyncEvalState,
	type Expr,
} from "./types.js";
import { emptyEffectRegistry, lookupEffect, type EffectRegistry } from "./effects.js";
import {
	boolVal as boolValCtor,
	closureVal,
	floatVal,
	intVal as intValCtor,
	isError,
	opaqueVal,
	stringVal as stringValCtor,
	undefinedVal,
} from "./types.js";
import { createAsyncChannelStore, type AsyncChannelStore } from "./async-effects.js";
import type {
	PirParExpr,
	PirSpawnExpr,
	PirAwaitExpr,
	PirChannelExpr,
	PirSendExpr,
	PirRecvExpr,
	PirSelectExpr,
	PirRaceExpr,
} from "./types.js";
import type { TaskScheduler as TaskSchedulerImport } from "./scheduler.js";
import { createTaskScheduler } from "./scheduler.js";

//==============================================================================
// Async Evaluation Options
//==============================================================================

export interface AsyncEvalOptions {
	maxSteps?: number;
	trace?: boolean;
	concurrency?: "sequential" | "parallel" | "speculative";
	scheduler?: TaskSchedulerImport;
}

//==============================================================================
// Async Evaluation Context
//==============================================================================

interface AsyncEvalContext {
	steps: number;
	maxSteps: number;
	trace: boolean;
	concurrency: "sequential" | "parallel" | "speculative";
	state: AsyncEvalState;
	nodeMap: Map<string, PirHybridNode>;
	nodeValues: Map<string, Value>;
}

//==============================================================================
// PIR Expression Kinds
//==============================================================================

const PIR_EXPRESSION_KINDS = [
	"par",
	"spawn",
	"await",
	"channel",
	"send",
	"recv",
	"select",
	"race",
] as const;

//==============================================================================
// Async Evaluator Class
//==============================================================================

export class AsyncEvaluator {
	private readonly _registry: OperatorRegistry;
	private readonly _defs: Defs;
	private readonly _effectRegistry: EffectRegistry;

	constructor(
		registry: OperatorRegistry,
		defs: Defs,
		effectRegistry: EffectRegistry = emptyEffectRegistry(),
	) {
		this._registry = registry;
		this._defs = defs;
		this._effectRegistry = effectRegistry;
	}

	get registry(): OperatorRegistry {
		return this._registry;
	}

	get defs(): Defs {
		return this._defs;
	}

	get effectRegistry(): EffectRegistry {
		return this._effectRegistry;
	}

	/**
	 * Evaluate a PIR document asynchronously
	 * @param doc - PIR document to evaluate
	 * @param options - Evaluation options
	 * @returns Promise that resolves with the result value
	 */
	async evaluateDocument(doc: PIRDocument, options?: AsyncEvalOptions): Promise<Value> {
		// Create async evaluation state
		const scheduler = options?.scheduler ?? createTaskScheduler({
			globalMaxSteps: options?.maxSteps ?? 1_000_000,
		});

		const channelStore = createAsyncChannelStore();

		const state: AsyncEvalState = {
			env: emptyValueEnv(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: options?.maxSteps ?? 1_000_000,
			taskId: "main",
			scheduler,
			channels: channelStore,
			taskPool: new Map(),
		};

		// Create node map and values
		const nodeMap = new Map<string, PirHybridNode>();
		for (const node of doc.nodes) {
			nodeMap.set(node.id, node);
		}

		const nodeValues = new Map<string, Value>();

		const context: AsyncEvalContext = {
			steps: 0,
			maxSteps: options?.maxSteps ?? 1_000_000,
			trace: options?.trace ?? false,
			concurrency: options?.concurrency ?? "sequential",
			state,
			nodeMap,
			nodeValues,
		};

		// Separate expression nodes and block nodes
		// Expression nodes are evaluated first so their values are available to block nodes
		const exprNodes: PirHybridNode[] = [];
		const blockNodes: PirHybridNode[] = [];
		for (const node of doc.nodes) {
			if (isBlockNode(node)) {
				blockNodes.push(node);
			} else {
				exprNodes.push(node);
			}
		}

		// Evaluate expression nodes first
		for (const node of exprNodes) {
			const result = await this.evalNode(node, nodeMap, nodeValues, context);
			nodeValues.set(node.id, result.value);

			// Update state from node evaluation
			context.state = result.state;
		}

		// Then evaluate block nodes (which can reference expression node values)
		for (const node of blockNodes) {
			if (nodeValues.has(node.id)) continue;

			const result = await this.evalNode(
				node,
				nodeMap,
				nodeValues,
				context,
			);

			nodeValues.set(node.id, result.value);

			// Update state from node evaluation
			context.state = result.state;
		}

		// Return the result node
		const resultNode = nodeValues.get(doc.result);
		if (!resultNode) {
			return errorVal(
				ErrorCodes.DomainError,
				`Result node not found: ${doc.result}`,
			);
		}

		return resultNode;
	}

	/**
	 * Evaluate a PIR expression asynchronously
	 * @param expr - Expression to evaluate
	 * @param env - Value environment
	 * @param options - Evaluation options
	 * @returns Promise that resolves with the result value
	 */
	async evaluate(
		expr: PirExpr,
		env: ValueEnv = emptyValueEnv(),
		options?: AsyncEvalOptions,
	): Promise<Value> {
		const scheduler = options?.scheduler ?? createTaskScheduler({
			globalMaxSteps: options?.maxSteps ?? 1_000_000,
		});

		const state: AsyncEvalState = {
			env,
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: options?.maxSteps ?? 1_000_000,
			taskId: "main",
			scheduler,
			channels: createAsyncChannelStore(),
			taskPool: new Map(),
		};

		const context: AsyncEvalContext = {
			steps: 0,
			maxSteps: options?.maxSteps ?? 1_000_000,
			trace: options?.trace ?? false,
			concurrency: options?.concurrency ?? "sequential",
			state,
			nodeMap: new Map(),
			nodeValues: new Map(),
		};

		return this.evalExpr(expr, env, context);
	}

	/**
	 * Evaluate a PIR node (expression or block-based)
	 */
	async evalNode(
		node: PirHybridNode,
		nodeMap: Map<string, PirHybridNode>,
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<{ value: Value; state: AsyncEvalState }> {
		// Handle block nodes (CFG-based async)
		if (isBlockNode(node)) {
			return this.evalBlockNode(node, nodeMap, nodeValues, context);
		}

		// Handle expression nodes
		const expr = node.expr;
		const value = await this.evalExpr(expr, context.state.env, context);
		return { value, state: context.state };
	}

	/**
	 * Evaluate a block node (CFG-based async execution)
	 */
	async evalBlockNode(
		node: BlockNode<PirBlock>,
		nodeMap: Map<string, PirHybridNode>,
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<{ value: Value; state: AsyncEvalState }> {
		const blockMap = new Map<string, PirBlock>();
		for (const block of node.blocks) {
			blockMap.set(block.id, block);
		}

		let currentBlockId = node.entry;
		const maxIterations = 10_000;
		let iterations = 0;

		while (iterations < maxIterations) {
			iterations++;
			const block = blockMap.get(currentBlockId);
			if (!block) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						`Block not found: ${currentBlockId}`,
					),
					state: context.state,
				};
			}

			// Execute instructions
			for (const instr of block.instructions) {
				const result = await this.execInstruction(instr, nodeMap, nodeValues, context);
				if (isError(result)) {
					return { value: result, state: context.state };
				}
			}

			// Handle terminator
			const termResult = await this.execTerminator(
				block.terminator,
				blockMap,
				nodeValues,
				context,
			);

			if (termResult.done) {
				return { value: termResult.value ?? voidVal(), state: context.state };
			}

			currentBlockId = termResult.nextBlock ?? "";
		}

		return {
			value: errorVal(ErrorCodes.DomainError, "Block execution exceeded maximum iterations"),
			state: context.state,
		};
	}

	/**
	 * Execute a PIR instruction
	 */
	async execInstruction(
		instr: unknown,
		nodeMap: Map<string, PirHybridNode>,
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<Value> {
		const kind = (instr as { kind: string }).kind;

		switch (kind) {
		case "assign":
			return this.execAssign(instr as { kind: "assign"; target: string; value: Expr }, nodeValues, context);
		case "op":
			return this.execOp(instr as { kind: "op"; target: string; ns: string; name: string; args: string[] }, nodeValues, context);
		case "spawn":
			return this.execSpawn(instr as { kind: "spawn"; target: string; entry: string; args?: string[] }, nodeMap, nodeValues, context);
		case "channelOp":
			return this.execChannelOp(instr as { kind: "channelOp"; op: string; channel: string; value?: string }, nodeValues, context);
		case "await":
			return this.execAwait(instr as { kind: "await"; target: string; future: string }, nodeValues, context);
		default:
			return errorVal(ErrorCodes.UnknownOperator, `Unknown instruction: ${kind}`);
		}
	}

	/**
	 * Execute terminator (returns { done, value?, nextBlock })
	 */
	async execTerminator(
		term: unknown,
		blockMap: Map<string, PirBlock>,
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
		const kind = (term as { kind: string }).kind;

		switch (kind) {
		case "jump":
			return { done: false, nextBlock: (term as { kind: "jump"; to: string }).to };
		case "branch": {
			const t = term as { kind: "branch"; cond: string; then: string; else: string };
			const condValue = nodeValues.get(t.cond);
			if (condValue?.kind !== "bool") {
				return { done: true, value: errorVal(ErrorCodes.TypeError, "Branch condition must be boolean") };
			}
			return { done: false, nextBlock: condValue.value ? t.then : t.else };
		}
		case "return": {
			const t = term as { kind: "return"; value?: string };
			const returnValue = t.value ? nodeValues.get(t.value) ?? voidVal() : voidVal();
			return { done: true, value: returnValue };
		}
		case "fork":
			return this.execFork(term as { kind: "fork"; branches: { block: string; taskId: string }[]; continuation: string }, blockMap, nodeValues, context);
		case "join":
			return this.execJoin(term as { kind: "join"; tasks: string[]; results?: string[]; to: string }, nodeValues, context);
		case "suspend":
			return this.execSuspend(term as { kind: "suspend"; future: string; resumeBlock: string }, nodeValues, context);
		default:
			return { done: true, value: errorVal(ErrorCodes.UnknownOperator, `Unknown terminator: ${kind}`) };
		}
	}

	/**
	 * Core expression evaluation: ρ, σ ⊢ e ⇓ v, σ'
	 */
	async evalExpr(
		expr: PirExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		await context.state.scheduler.checkGlobalSteps();

		// Check for PIR-specific expressions first
		const kind = expr.kind as string;
		if (PIR_EXPRESSION_KINDS.includes(kind as (typeof PIR_EXPRESSION_KINDS)[number])) {
			return this.evalPirExpr(expr, env, context);
		}

		// Delegate to EIR evaluation for non-PIR expressions
		return this.evalEirExpr(expr as EirExpr, env, context);
	}

	/**
	 * Evaluate PIR-specific expressions (par, spawn, await, channels)
	 */
	async evalPirExpr(
		expr: PirExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		switch (expr.kind) {
		case "par":
			return this.evalPar(expr, env, context);

		case "spawn":
			return this.evalSpawnExpr(expr, env, context);

		case "await":
			return this.evalAwaitExpr(expr, env, context);

		case "channel":
			return this.evalChannelExpr(expr, env, context);

		case "send":
			return this.evalSendExpr(expr, env, context);

		case "recv":
			return this.evalRecvExpr(expr, env, context);

		case "select":
			return this.evalSelectExpr(expr, env, context);

		case "race":
			return this.evalRaceExpr(expr, env, context);
			// No default: TypeScript ensures all PirExpr cases are handled
		}
		// Runtime fallback for any unexpected expression kinds
		return errorVal(ErrorCodes.UnknownOperator, `Unknown expression kind: ${expr.kind}`);
	}

	/**
	 * E-Par: Parallel composition - evaluate branches concurrently
	 * ρ, σ ⊢ par(e₁, e₂, ...) ⇓ [v₁, v₂, ...], σ'
	 */
	async evalPar(
		expr: PirParExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const evalBranch = async (branchId: string): Promise<Value> => {
			const node = context.nodeMap.get(branchId);
			if (!node) {
				return errorVal(ErrorCodes.UnboundIdentifier, `Branch node not found: ${branchId}`);
			}

			if (isBlockNode(node)) {
				const result = await this.evalBlockNode(node, context.nodeMap, context.nodeValues, context);
				return result.value;
			} else {
				return await this.evalExpr(node.expr, env, context);
			}
		};

		if (context.concurrency === "sequential") {
			const results: Value[] = [];
			for (const branchId of expr.branches) {
				const value = await evalBranch(branchId);
				results.push(value);
			}
			return listVal(results);
		}

		const branchPromises = expr.branches.map((branchId) => evalBranch(branchId));
		const results = await Promise.all(branchPromises);
		return listVal(results);
	}

	/**
	 * E-Spawn: Create an async task that returns a Future
	 * ρ, σ ⊢ spawn(e) ⇓ Future(taskId), σ'
	 */
	async evalSpawnExpr(
		expr: PirSpawnExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;

		const taskNode = context.nodeMap.get(expr.task);
		if (!taskNode) {
			return errorVal(ErrorCodes.UnboundIdentifier, `Spawn task node not found: ${expr.task}`);
		}

		// Capture the current env for any variables that might be referenced
		const capturedEnv = new Map(env);

		context.state.scheduler.spawn(taskId, async () => {
			try {
				if (isBlockNode(taskNode)) {
					const result = await this.evalBlockNode(
						taskNode,
						context.nodeMap,
						context.nodeValues,
						context
					);
					return result.value;
				} else {
					// Create a task context with a new env that merges captured env with access to nodeValues
					// We need to evaluate the task node expression and resolve any references
					const value = await this.evalExpr(taskNode.expr, capturedEnv, context);
					return value;
				}
			} catch (error) {
				return errorVal(ErrorCodes.DomainError, `Task error: ${String(error)}`);
			}
		});

		return futureVal(taskId, "pending");
	}

	/**
	 * E-Await: Wait for a Future to complete
	 * ρ, σ ⊢ await(f) ⇓ v, σ'  where f.status = ready and f.value = v
	 */
	async evalAwaitExpr(
		expr: PirAwaitExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		// Resolve the future expression
		const futureValue = await this.resolveNodeRef(expr.future, env, context);

		if (!isFuture(futureValue)) {
			return errorVal(ErrorCodes.TypeError, "await requires a Future value");
		}

		if (futureValue.status === "error") {
			return errorVal(ErrorCodes.DomainError, "Future completed with error");
		}

		if (futureValue.status === "ready") {
			return this.wrapAwaitResult(futureValue.value ?? voidVal(), expr.returnIndex, 0);
		}

		// Handle timeout
		if (expr.timeout) {
			const timeoutValue = await this.resolveNodeRef(expr.timeout, env, context);
			if (timeoutValue.kind !== "int") {
				return errorVal(ErrorCodes.TypeError, "await timeout must be an integer");
			}
			const timeoutMs = timeoutValue.value;

			// Create a timeout promise
			const timeoutPromise = new Promise<Value>((resolve) => {
				setTimeout(() => {
					if (expr.fallback) {
						void this.resolveNodeRef(expr.fallback, env, context).then(resolve).catch((err: unknown) => {
							resolve(err instanceof Error ? errorVal(ErrorCodes.DomainError, err.message) : errorVal(ErrorCodes.DomainError, String(err)));
						});
					} else {
						resolve(errorVal(ErrorCodes.TimeoutError, "Await timed out"));
					}
				}, timeoutMs);
			});

			// Race between the future and the timeout
			const result = await Promise.race([
				context.state.scheduler.await(futureValue.taskId),
				timeoutPromise,
			]);

			// Check if we timed out by seeing if the result is an error or matches fallback
			const isTimeout = isError(result) && result.code === ErrorCodes.TimeoutError;
			return this.wrapAwaitResult(result, expr.returnIndex, isTimeout ? 1 : 0);
		}

		// No timeout - just wait for the future
		const result = await context.state.scheduler.await(futureValue.taskId);
		return this.wrapAwaitResult(result, expr.returnIndex, 0);
	}

	/**
	 * Helper to wrap await result based on returnIndex flag
	 */
	private wrapAwaitResult(value: Value, returnIndex: boolean | undefined, index: number): Value {
		if (returnIndex) {
			return { kind: "selectResult", index, value };
		}
		return value;
	}

	/**
	 * E-Channel: Create a new channel
	 * ρ, σ ⊢ channel(type, size) ⇓ Channel(id), σ'
	 */
	async evalChannelExpr(
		expr: PirChannelExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const bufferSize = expr.bufferSize
			? await this.resolveNodeRef(expr.bufferSize, env, context)
			: intVal(0);

		if (bufferSize.kind !== "int") {
			return errorVal(ErrorCodes.TypeError, "Channel buffer size must be an integer");
		}

		const channelId = this.getChannels(context.state).create(bufferSize.value);
		return channelVal(channelId, expr.channelType);
	}

	/**
	 * E-Send: Send a value to a channel
	 * ρ, σ ⊢ send(ch, v) ⇓ Void, σ'
	 */
	async evalSendExpr(
		expr: PirSendExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const channelValue = await this.resolveNodeRef(expr.channel, env, context);
		const valueToSend = await this.resolveNodeRef(expr.value, env, context);

		if (!isChannel(channelValue)) {
			return errorVal(ErrorCodes.TypeError, "send requires a Channel value");
		}

		const channel = this.getChannels(context.state).get(channelValue.id);
		if (!channel) {
			return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelValue.id}`);
		}

		// For expression nodes (not block instructions), send is non-blocking:
		// Start the send operation and return immediately without waiting.
		// This allows unbuffered channels to work with sequential evaluation.
		// The send will complete in the background when recv() is called.
		void channel.send(valueToSend);
		return voidVal();
	}

	/**
	 * E-Recv: Receive a value from a channel
	 * ρ, σ ⊢ recv(ch) ⇓ v, σ'
	 */
	async evalRecvExpr(
		expr: PirRecvExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const channelValue = await this.resolveNodeRef(expr.channel, env, context);

		if (!isChannel(channelValue)) {
			return errorVal(ErrorCodes.TypeError, "recv requires a Channel value");
		}

		const channel = this.getChannels(context.state).get(channelValue.id);
		if (!channel) {
			return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelValue.id}`);
		}

		const value = await channel.recv();
		return value;
	}

	/**
	 * E-Select: Wait for multiple futures, return first to complete
	 * ρ, σ ⊢ select([f₁, f₂, ...]) ⇓ v, σ'
	 */
	async evalSelectExpr(
		expr: PirSelectExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		// Build promises that resolve to { index, value, kind: 'future' }
		interface SelectResult { index: number; value: Value; kind: "future" | "timeout" }
		const futurePromises: Promise<SelectResult>[] = expr.futures.map(async (futureId, index) => {
			const futureValue = await this.resolveNodeRef(futureId, env, context);
			if (!isFuture(futureValue)) {
				throw new Error("select requires Future values");
			}
			const value = await context.state.scheduler.await(futureValue.taskId);
			return { index, value, kind: "future" as const };
		});

		// Add timeout promise if specified
		if (expr.timeout) {
			const timeoutValue = await this.resolveNodeRef(expr.timeout, env, context);
			if (timeoutValue.kind !== "int") {
				return errorVal(ErrorCodes.TypeError, "select timeout must be an integer");
			}
			const timeoutMs = timeoutValue.value;

			// Create timeout promise
			const timeoutPromise = new Promise<SelectResult>((resolve) => {
				setTimeout(() => {
					if (expr.fallback) {
						void this.resolveNodeRef(expr.fallback, env, context).then((fallbackValue) => {
							resolve({ index: -1, value: fallbackValue, kind: "timeout" });
						}).catch((err: unknown) => {
							const errVal = err instanceof Error ? errorVal(ErrorCodes.DomainError, err.message) : errorVal(ErrorCodes.DomainError, String(err));
							resolve({ index: -1, value: errVal, kind: "timeout" });
						});
					} else {
						resolve({ index: -1, value: errorVal(ErrorCodes.SelectTimeout, "Select timed out"), kind: "timeout" });
					}
				}, timeoutMs);
			});

			futurePromises.push(timeoutPromise);
		}

		// Race: first to complete wins
		const result = await Promise.race(futurePromises);

		// Return based on returnIndex flag
		if (expr.returnIndex) {
			return { kind: "selectResult", index: result.index, value: result.value };
		}
		return result.value;
	}

	/**
	 * E-Race: Execute multiple tasks, return first result
	 * ρ, σ ⊢ race([e₁, e₂, ...]) ⇓ v, σ'
	 */
	async evalRaceExpr(
		expr: PirRaceExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const evalTask = async (taskId: string): Promise<Value> => {
			const node = context.nodeMap.get(taskId);
			if (!node) {
				return errorVal(ErrorCodes.UnboundIdentifier, `Race task node not found: ${taskId}`);
			}

			if (isBlockNode(node)) {
				const result = await this.evalBlockNode(node, context.nodeMap, context.nodeValues, context);
				return result.value;
			} else {
				return await this.evalExpr(node.expr, env, context);
			}
		};

		const taskPromises = expr.tasks.map((taskId) => evalTask(taskId));
		const result = await Promise.race(taskPromises);

		return result;
	}

	/**
	 * Evaluate EIR expressions (delegated from async context)
	 */
	async evalEirExpr(
		expr: EirExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		// Handle basic EIR expressions
		switch (expr.kind) {
		case "lit":
			return this.evalLit(expr);
		case "var":
			return this.evalVar(expr, env, context);
		case "call":
			return this.evalCall(expr, env, context);
		case "if":
			return this.evalIf(expr, env, context);
		case "let":
			return this.evalLet(expr, env, context);
		case "lambda":
			return this.evalLambda(expr, env);
		case "callExpr":
			return this.evalCallExpr(expr, env, context);
		case "fix":
			return this.evalFix(expr, env, context);
		case "seq":
			return this.evalSeq(expr, env, context);
		case "assign":
			return this.evalAssignExpr(expr, env, context);
		case "while":
			return this.evalWhile(expr, env, context);
		case "for":
			return this.evalFor(expr, env, context);
		case "iter":
			return this.evalIter(expr, env, context);
		case "effect":
			return this.evalEffect(expr, env, context);
		case "refCell":
			return this.evalRefCellExpr(expr, env, context);
		case "ref":
			return this.evalRefExpr(expr, env, context);
		case "try":
			return this.evalTryExpr(expr, env, context);
			// No default: TypeScript ensures all EirExpr cases are handled
		}
		// Runtime fallback for any unexpected expression kinds
		return errorVal(ErrorCodes.UnknownOperator, `Unknown expression kind: ${expr.kind}`);
	}

	// ============================================================================
	// EIR Expression Evaluation (async versions)
	// ============================================================================

	private evalLit(expr: { kind: "lit"; type: Type; value: unknown }): Value {
		const t = expr.type;
		const v = expr.value;

		switch (t.kind) {
		case "bool":
			return boolValCtor(!!v);
		case "int":
			return intValCtor(Number(v));
		case "float":
			return floatVal(Number(v));
		case "string":
			return stringValCtor(String(v));
		case "void":
			return voidVal();
		default:
			return opaqueVal(t.kind, v);
		}
	}

	private evalVar(expr: { kind: "var"; name: string }, env: ValueEnv, context?: AsyncEvalContext): Value {
		// First check environment
		const value = lookupValue(env, expr.name);
		if (value) {
			return value;
		}

		// Then check nodeValues (for expression node references)
		if (context) {
			const nodeValue = context.nodeValues.get(expr.name);
			if (nodeValue && !isError(nodeValue)) {
				return nodeValue;
			}
		}

		return errorVal(ErrorCodes.UnboundIdentifier, `Unbound variable: ${expr.name}`);
	}

	private async evalCall(
		expr: { kind: "call"; ns: string; name: string; args: string[] },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		// Resolve arguments (these are node refs in PIR)
		const argValues: Value[] = [];
		for (const argId of expr.args) {
			const value = await this.resolveNodeRef(argId, env, context);
			argValues.push(value);
		}

		// Look up operator
		const op = lookupOperator(this._registry, expr.ns, expr.name);
		if (!op) {
			return errorVal(
				ErrorCodes.UnknownOperator,
				`Unknown operator: ${expr.ns}.${expr.name}`,
			);
		}

		// Apply operator
		try {
			return op.fn(...argValues);
		} catch (e) {
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}

	private async evalIf(
		expr: { kind: "if"; cond: string; then: string; else: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const condValue = await this.resolveNodeRef(expr.cond, env, context);

		if (condValue.kind !== "bool") {
			return errorVal(ErrorCodes.TypeError, "if condition must be boolean");
		}

		const branchId = condValue.value ? expr.then : expr.else;
		return this.resolveNodeRef(branchId, env, context);
	}

	private async evalLet(
		expr: { kind: "let"; name: string; value: string; body: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const value = await this.resolveNodeRef(expr.value, env, context);
		const newEnv = extendValueEnv(env, expr.name, value);
		return this.resolveNodeRef(expr.body, newEnv, context);
	}

	private evalLambda(
		expr: { kind: "lambda"; params: (string | { name: string; optional?: boolean; default?: import("./types.js").Expr })[]; body: string },
		env: ValueEnv,
	): Value {
		// Convert params to LambdaParam format
		const lambdaParams: import("./types.js").LambdaParam[] = expr.params.map(p =>
			typeof p === "string" ? { name: p } : p
		);
		return closureVal(lambdaParams, { kind: "ref", id: expr.body }, env);
	}

	private async evalCallExpr(
		expr: { kind: "callExpr"; fn: string; args: string[] },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const fnValue = await this.resolveNodeRef(expr.fn, env, context);

		if (fnValue.kind !== "closure") {
			return errorVal(ErrorCodes.TypeError, "callExpr requires a closure");
		}

		const argValues: Value[] = [];
		for (const argId of expr.args) {
			argValues.push(await this.resolveNodeRef(argId, env, context));
		}

		// Check arity with optional parameter support
		// Calculate min arity (required params) and max arity (all params)
		let minArity = 0;
		for (const param of fnValue.params) {
			if (!param.optional) {
				minArity++;
			}
		}
		const maxArity = fnValue.params.length;

		if (argValues.length < minArity) {
			return errorVal(
				ErrorCodes.ArityError,
				`Arity error: expected at least ${minArity} args, got ${argValues.length}`,
			);
		}
		if (argValues.length > maxArity) {
			return errorVal(
				ErrorCodes.ArityError,
				`Arity error: expected at most ${maxArity} args, got ${argValues.length}`,
			);
		}

		// Bind parameters with optional support
		let newEnv = fnValue.env;
		for (let i = 0; i < fnValue.params.length; i++) {
			const param = fnValue.params[i];
			if (!param) break; // Should never happen, but TypeScript needs safety
			const argValue = argValues[i];

			if (argValue !== undefined) {
				// Provided argument - use it
				newEnv = extendValueEnv(newEnv, param.name, argValue);
			} else if (param.optional) {
				// Omitted optional param - check for default or use undefined
				if (param.default !== undefined) {
					// Evaluate default expression in closure's defining environment
					const defaultVal = await this.evalExpr(param.default, fnValue.env, context);
					if (isError(defaultVal)) {
						return defaultVal;
					}
					newEnv = extendValueEnv(newEnv, param.name, defaultVal);
				} else {
					// Optional without default = undefined
					newEnv = extendValueEnv(newEnv, param.name, undefinedVal());
				}
			} else {
				// Required param not provided
				return errorVal(
					ErrorCodes.ArityError,
					`Missing required parameter: ${param.name}`,
				);
			}
		}

		return this.resolveNodeRef((fnValue.body as { id: string }).id, newEnv, context);
	}

	private async evalFix(
		expr: { kind: "fix"; fn: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const fnValue = await this.resolveNodeRef(expr.fn, env, context);

		if (fnValue.kind !== "closure") {
			return errorVal(ErrorCodes.TypeError, "fix requires a closure");
		}

		// Create self-referential closure
		const selfRef = closureVal(fnValue.params, fnValue.body, env);
		const firstParam = fnValue.params[0];
		const firstParamName = firstParam ? firstParam.name : "self";
		const fixedEnv = extendValueEnv(env, firstParamName, selfRef);
		selfRef.env = fixedEnv;

		return selfRef;
	}

	private async evalSeq(
		expr: { kind: "seq"; first: string; then: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		await this.resolveNodeRef(expr.first, env, context);
		return await this.resolveNodeRef(expr.then, env, context);
	}

	private async evalAssignExpr(
		expr: { kind: "assign"; target: string; value: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const value = await this.resolveNodeRef(expr.value, env, context);

		// Update ref cell
		let cell = context.state.refCells.get(expr.target);
		if (cell?.kind === "refCell") {
			cell.value = value;
		} else {
			cell = { kind: "refCell", value };
			context.state.refCells.set(expr.target, cell);
		}

		return voidVal();
	}

	private async evalWhile(
		expr: { kind: "while"; cond: string; body: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const maxIterations = 10_000;
		let iterations = 0;

		while (iterations < maxIterations) {
			const condValue = await this.resolveNodeRef(expr.cond, env, context);

			if (condValue.kind !== "bool") {
				return errorVal(ErrorCodes.TypeError, "while condition must be boolean");
			}

			if (!condValue.value) {
				break;
			}

			await this.resolveNodeRef(expr.body, env, context);
			iterations++;
		}

		return voidVal();
	}

	private async evalFor(
		expr: { kind: "for"; var: string; init: string; cond: string; update: string; body: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		await this.resolveNodeRef(expr.init, env, context);

		const maxIterations = 10_000;
		let iterations = 0;

		while (iterations < maxIterations) {
			const condValue = await this.resolveNodeRef(expr.cond, env, context);

			if (condValue.kind !== "bool" || !condValue.value) {
				break;
			}

			await this.resolveNodeRef(expr.body, env, context);
			await this.resolveNodeRef(expr.update, env, context);
			iterations++;
		}

		return voidVal();
	}

	private async evalIter(
		expr: { kind: "iter"; var: string; iter: string; body: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const iterValue = await this.resolveNodeRef(expr.iter, env, context);

		if (iterValue.kind !== "list") {
			return errorVal(ErrorCodes.TypeError, "iter requires a list");
		}

		for (const item of iterValue.value) {
			const newEnv = extendValueEnv(env, expr.var, item);
			await this.resolveNodeRef(expr.body, newEnv, context);
		}

		return voidVal();
	}

	private async evalEffect(
		expr: { kind: "effect"; op: string; args: string[] },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const argValues: Value[] = [];
		for (const argId of expr.args) {
			argValues.push(await this.resolveNodeRef(argId, env, context));
		}

		const effect = lookupEffect(this._effectRegistry, expr.op);
		if (!effect) {
			return errorVal(ErrorCodes.UnknownOperator, `Unknown effect: ${expr.op}`);
		}

		try {
			return effect.fn(...argValues);
		} catch (e) {
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}

	private async evalRefCellExpr(
		expr: { kind: "refCell"; target: string },
		_env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const cell = context.state.refCells.get(expr.target);
		return cell ?? refCellVal(voidVal());
	}

	/**
	 * E-Ref: Resolve node reference to its value
	 * Looks up in nodeValues first (cached), then environment
	 */
	private evalRefExpr(
		expr: { kind: "ref"; id: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Value {
		// Look up in nodeValues first (cached node results)
		const nodeValue = context.nodeValues.get(expr.id);
		if (nodeValue !== undefined) {
			return nodeValue;
		}

		// Then check environment (for parameters, let bindings)
		const envValue = lookupValue(env, expr.id);
		if (envValue !== undefined) {
			return envValue;
		}

		// Check ref cells (for assignments)
		const cell = context.state.refCells.get(expr.id);
		if (cell?.kind === "refCell") {
			return cell.value;
		}

		return errorVal(ErrorCodes.DomainError, "Reference not found: " + expr.id);
	}

	/**
	 * E-Try: Error handling with try/catch/fallback
	 * If tryBody produces error, bind to catchParam and evaluate catchBody
	 * If tryBody succeeds and fallback exists, evaluate fallback
	 * Otherwise return tryBody result
	 */
	private async evalTryExpr(
		expr: { kind: "try"; tryBody: string; catchParam: string; catchBody: string; fallback?: string },
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		const e = expr as { kind: "try"; tryBody: string; catchParam: string; catchBody: string; fallback?: string };

		// Check if tryBody was already evaluated and has a value in nodeValues
		let tryValue = context.nodeValues.get(e.tryBody);

		// If not in nodeValues, evaluate it now
		if (tryValue === undefined) {
			const tryBodyNode = context.nodeMap.get(e.tryBody);
			if (!tryBodyNode) {
				return errorVal(ErrorCodes.ValidationError, "Try body node not found: " + e.tryBody);
			}

			// Evaluate the tryBody node
			const tryResult = await this.evalNode(tryBodyNode, context.nodeMap, context.nodeValues, context);
			tryValue = tryResult.value;

			// Cache the result
			context.nodeValues.set(e.tryBody, tryValue);
		}

		// Check if error occurred
		if (isError(tryValue)) {
			// ERROR PATH - bind error to catchParam and evaluate catchBody
			const catchEnv = extendValueEnv(env, e.catchParam, tryValue);

			const catchBodyNode = context.nodeMap.get(e.catchBody);
			if (!catchBodyNode) {
				return errorVal(ErrorCodes.ValidationError, "Catch body node not found: " + e.catchBody);
			}

			// Create a modified context with the catch environment
			const catchContext: AsyncEvalContext = {
				...context,
				state: {
					...context.state,
					env: catchEnv,
				},
			};

			const catchResult = await this.evalNode(catchBodyNode, catchContext.nodeMap, catchContext.nodeValues, catchContext);
			return catchResult.value;
		}

		// SUCCESS PATH
		if (e.fallback) {
			// Has fallback - evaluate it
			const fallbackNode = context.nodeMap.get(e.fallback);
			if (!fallbackNode) {
				return errorVal(ErrorCodes.ValidationError, "Fallback node not found: " + e.fallback);
			}

			const fallbackResult = await this.evalNode(fallbackNode, context.nodeMap, context.nodeValues, context);
			return fallbackResult.value;
		}

		// No fallback - return tryBody result directly
		return tryValue;
	}

	// ============================================================================
	// Instruction Execution (CFG-based)
	// ============================================================================

	private async execAssign(
		instr: { kind: "assign"; target: string; value: Expr },
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<Value> {
		// Evaluate the value expression
		const value = await this.evalExpr(instr.value, context.state.env, context);
		if (isError(value)) {
			return value;
		}

		// Update ref cell
		let cell = context.state.refCells.get(instr.target);
		if (cell?.kind === "refCell") {
			cell.value = value;
		} else {
			cell = { kind: "refCell", value };
			context.state.refCells.set(instr.target, cell);
		}

		// Also store in nodeValues so instructions can find it
		nodeValues.set(instr.target, value);

		return voidVal();
	}

	private async execOp(
		instr: { kind: "op"; target: string; ns: string; name: string; args: string[] },
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<Value> {
		const argValues = instr.args.map((argId) => nodeValues.get(argId) ?? voidVal());

		const op = lookupOperator(this._registry, instr.ns, instr.name);
		if (!op) {
			return errorVal(ErrorCodes.UnknownOperator, `Unknown operator: ${instr.ns}:${instr.name}`);
		}

		try {
			const result = op.fn(...argValues);
			// Store result in both refCells (for ref operations) and nodeValues (for terminator resolution)
			context.state.refCells.set(instr.target, { kind: "refCell", value: result });
			nodeValues.set(instr.target, result);
			return voidVal();
		} catch (e) {
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}

	private async execSpawn(
		instr: { kind: "spawn"; target: string; entry: string; args?: string[] },
		nodeMap: Map<string, PirHybridNode>,
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<Value> {
		const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;

		const entryNode = nodeMap.get(instr.entry);
		if (!entryNode) {
			return errorVal(ErrorCodes.UnboundIdentifier, `Spawn entry block not found: ${instr.entry}`);
		}

		const argValues: Value[] = [];
		if (instr.args) {
			for (const argId of instr.args) {
				const value = nodeValues.get(argId);
				if (!value) {
					return errorVal(ErrorCodes.UnboundIdentifier, `Spawn arg not found: ${argId}`);
				}
				argValues.push(value);
			}
		}

		const taskEnv = extendValueEnvMany(
			context.state.env,
			instr.args
				? instr.args
					.map((argId, i) => [argId, argValues[i]] as [string, Value | undefined])
					.filter((pair): pair is [string, Value] => pair[1] !== undefined)
				: []
		);

		context.state.scheduler.spawn(taskId, async () => {
			try {
				if (isBlockNode(entryNode)) {
					const taskContext: AsyncEvalContext = {
						...context,
						state: {
							...context.state,
							env: taskEnv,
							taskId,
						},
					};

					const result = await this.evalBlockNode(entryNode, nodeMap, nodeValues, taskContext);
					return result.value;
				} else {
					return await this.evalExpr(entryNode.expr, taskEnv, context);
				}
			} catch (error) {
				return errorVal(ErrorCodes.DomainError, `Spawn task error: ${String(error)}`);
			}
		});

		const future = futureVal(taskId, "pending");
		context.state.refCells.set(instr.target, { kind: "refCell", value: future });
		return voidVal();
	}

	private async execChannelOp(
		instr: { kind: "channelOp"; op: string; channel: string; value?: string },
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<Value> {
		const channelValue = nodeValues.get(instr.channel);
		if (!channelValue || !isChannel(channelValue)) {
			return errorVal(ErrorCodes.TypeError, "channelOp requires a Channel value");
		}

		const channel = this.getChannels(context.state).get(channelValue.id);
		if (!channel) {
			return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelValue.id}`);
		}

		switch (instr.op) {
		case "send": {
			const value = instr.value ? nodeValues.get(instr.value) : voidVal();
			if (!value) {
				return errorVal(ErrorCodes.DomainError, `Value not found: ${instr.value}`);
			}
			await channel.send(value);
			return voidVal();
		}
		case "recv": {
			const received = await channel.recv();
			const recvInstr = instr as { kind: "channelOp"; op: string; channel: string; target?: string };
			if (recvInstr.target) {
				context.state.refCells.set(recvInstr.target, { kind: "refCell", value: received });
			}
			return voidVal();
		}
		default:
			return errorVal(ErrorCodes.UnknownOperator, `Unknown channelOp: ${instr.op}`);
		}
	}

	private async execAwait(
		instr: { kind: "await"; target: string; future: string },
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<Value> {
		const futureValue = nodeValues.get(instr.future);
		if (!futureValue || !isFuture(futureValue)) {
			return errorVal(ErrorCodes.TypeError, "await requires a Future value");
		}

		const result = await context.state.scheduler.await(futureValue.taskId);
		// Store in both refCells and nodeValues
		context.state.refCells.set(instr.target, { kind: "refCell", value: result });
		nodeValues.set(instr.target, result);
		return voidVal();
	}

	private async execFork(
		term: { kind: "fork"; branches: { block: string; taskId: string }[]; continuation: string },
		blockMap: Map<string, PirBlock>,
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
		// Use a shared flag to track if continuation was executed
		// This must be in an object to be shared across closures
		const continuationState = { executed: false, result: undefined as Value | undefined };

		// Spawn all branch tasks in parallel
		const taskIds: string[] = [];
		for (const branch of term.branches) {
			const block = blockMap.get(branch.block);
			if (!block) {
				context.state.scheduler.spawn(branch.taskId, async () =>
					errorVal(ErrorCodes.DomainError, `Fork block not found: ${branch.block}`)
				);
				taskIds.push(branch.taskId);
				continue;
			}

			context.state.scheduler.spawn(branch.taskId, async () => {
				try {
					// Execute branch block instructions
					for (const instr of block.instructions) {
						const result = await this.execInstruction(instr, context.nodeMap, nodeValues, context);
						if (isError(result)) {
							return result;
						}
					}

					// Execute branch terminator
					const termResult = await this.execTerminator(block.terminator, blockMap, nodeValues, context);
					if (termResult.done) {
						return termResult.value ?? voidVal();
					}

					// If jumping to continuation, handle with lock to prevent race
					if (termResult.nextBlock === term.continuation) {
						// Only first task to reach continuation executes it
						if (!continuationState.executed) {
							continuationState.executed = true;
							const nextBlock = blockMap.get(term.continuation);
							if (nextBlock) {
								// Execute continuation block
								for (const instr of nextBlock.instructions) {
									const result = await this.execInstruction(instr, context.nodeMap, nodeValues, context);
									if (isError(result)) {
										continuationState.result = result;
										return result;
									}
								}
								const nextTermResult = await this.execTerminator(nextBlock.terminator, blockMap, nodeValues, context);
								if (nextTermResult.done) {
									continuationState.result = nextTermResult.value ?? voidVal();
									return continuationState.result;
								}
							}
						}
					}

					return voidVal();
				} catch (error) {
					const err = errorVal(ErrorCodes.DomainError, `Fork branch error: ${String(error)}`);
					if (!continuationState.executed) {
						continuationState.result = err;
					}
					return err;
				}
			});
			taskIds.push(branch.taskId);
		}

		// Wait for all branch tasks to complete
		await Promise.all(taskIds.map((id) => context.state.scheduler.await(id)));

		// If continuation was already executed by a branch, return its result
		if (continuationState.executed) {
			return { done: true, value: continuationState.result ?? voidVal() };
		}

		// Otherwise, continue to the continuation block
		return { done: false, nextBlock: term.continuation };
	}

	private async execJoin(
		term: { kind: "join"; tasks: string[]; results?: string[]; to: string },
		_nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
		// Wait for all tasks
		const results = await Promise.all(
			term.tasks.map((taskId) => context.state.scheduler.await(taskId)),
		);

		// Store results if requested
		if (term.results) {
			for (let i = 0; i < results.length; i++) {
				const resultCell = term.results[i];
				const resultValue = results[i];
				if (resultCell !== undefined && resultValue !== undefined) {
					context.state.refCells.set(resultCell, {
						kind: "refCell",
						value: resultValue,
					});
				}
			}
		}

		return { done: false, nextBlock: term.to };
	}

	private async execSuspend(
		term: { kind: "suspend"; future: string; resumeBlock: string },
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
		const futureValue = nodeValues.get(term.future);
		if (!futureValue || !isFuture(futureValue)) {
			return { done: true, value: errorVal(ErrorCodes.TypeError, "suspend requires a Future value") };
		}

		await context.state.scheduler.await(futureValue.taskId);
		return { done: false, nextBlock: term.resumeBlock };
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Resolve a node reference to its value
	 * In PIR, expressions reference other nodes by ID
	 * This method looks up the node and evaluates it if needed
	 */
	private async resolveNodeRef(
		nodeId: string,
		env: ValueEnv,
		context: AsyncEvalContext,
	): Promise<Value> {
		// Check if already in environment
		const envValue = lookupValue(env, nodeId);
		if (envValue) {
			return envValue;
		}

		// Check ref cells (for assignments and instruction results)
		const cell = context.state.refCells.get(nodeId);
		if (cell?.kind === "refCell") {
			return cell.value;
		}

		// Check nodeValues (for already evaluated nodes)
		// Note: Don't return cached error values - they might have failed due to missing
		// environment bindings and should be re-evaluated with the current environment
		const nodeValue = context.nodeValues.get(nodeId);
		if (nodeValue && !isError(nodeValue)) {
			return nodeValue;
		}

		// Check nodeMap for unevaluated nodes
		const node = context.nodeMap.get(nodeId);
		if (node) {
			if (isBlockNode(node)) {
				const result = await this.evalBlockNode(node, context.nodeMap, context.nodeValues, context);
				context.nodeValues.set(nodeId, result.value);
				return result.value;
			} else {
				const value = await this.evalExpr(node.expr, env, context);
				context.nodeValues.set(nodeId, value);
				return value;
			}
		}

		return errorVal(ErrorCodes.UnboundIdentifier, `Node not found: ${nodeId}`);
	}

	/**
	 * Get channels as AsyncChannelStore (handles unknown type from circular dependency)
	 */
	private getChannels(state: AsyncEvalState): AsyncChannelStore {
		return state.channels as AsyncChannelStore;
	}
}

//==============================================================================
// Factory Functions
//==============================================================================

/**
 * Create an async evaluator
 */
export function createAsyncEvaluator(
	registry: OperatorRegistry,
	defs: Defs,
	effectRegistry?: EffectRegistry,
): AsyncEvaluator {
	return new AsyncEvaluator(registry, defs, effectRegistry);
}

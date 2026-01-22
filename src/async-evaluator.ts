 
 
 
 
 
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/await-thenable */

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

		for (const node of doc.nodes) {
			if (nodeValues.has(node.id)) continue;

			const result = await this.evalNode(
				node,
				nodeMap,
				nodeValues,
				context,
			);

			nodeValues.set(node.id, result.value);

			// Update state from node evaluation
			if (result.state) {
				context.state = result.state;
			}
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
			return this.execAssign(instr as { kind: "assign"; target: string; value: string }, nodeValues, context);
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
			return futureValue.value ?? voidVal();
		}

		// Wait for the future to complete
		const result = await context.state.scheduler.await(futureValue.taskId);
		return result;
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

		await channel.send(valueToSend);
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
		const futurePromises = expr.futures.map(async (futureId) => {
			const futureValue = await this.resolveNodeRef(futureId, env, context);
			if (!isFuture(futureValue)) {
				throw new Error("select requires Future values");
			}
			return context.state.scheduler.await(futureValue.taskId);
		});

		// Race: first to complete wins
		const result = await Promise.race(futurePromises);
		return result;
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
			return this.evalVar(expr, env);
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

	private evalVar(expr: { kind: "var"; name: string }, env: ValueEnv): Value {
		const value = lookupValue(env, expr.name);
		if (!value) {
			return errorVal(ErrorCodes.UnboundIdentifier, `Unbound variable: ${expr.name}`);
		}
		return value;
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
		expr: { kind: "lambda"; params: string[]; body: string },
		env: ValueEnv,
	): Value {
		return closureVal(expr.params, { kind: "ref", id: expr.body }, env);
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

		// Bind parameters
		let newEnv = fnValue.env;
		for (let i = 0; i < fnValue.params.length; i++) {
			newEnv = extendValueEnv(newEnv, fnValue.params[i]!, argValues[i]!);
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
		const fixedEnv = extendValueEnv(env, fnValue.params[0] ?? "self", selfRef);
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
		return cell ? cell : refCellVal(voidVal());
	}

	// ============================================================================
	// Instruction Execution (CFG-based)
	// ============================================================================

	private async execAssign(
		instr: { kind: "assign"; target: string; value: string },
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<Value> {
		const value = nodeValues.get(instr.value);
		if (!value) {
			return errorVal(ErrorCodes.DomainError, `Value not found: ${instr.value}`);
		}

		// Update ref cell
		let cell = context.state.refCells.get(instr.target);
		if (cell?.kind === "refCell") {
			cell.value = value;
		} else {
			cell = { kind: "refCell", value };
			context.state.refCells.set(instr.target, cell);
		}

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
			return errorVal(ErrorCodes.UnknownOperator, `Unknown operator: ${instr.ns}.${instr.name}`);
		}

		try {
			const result = await op.fn(...argValues);
			context.state.refCells.set(instr.target, { kind: "refCell", value: result });
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
			instr.args ? instr.args.map((argId, i) => [argId, argValues[i]!] as [string, Value]) : []
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
		context.state.refCells.set(instr.target, { kind: "refCell", value: result });
		return voidVal();
	}

	private async execFork(
		term: { kind: "fork"; branches: { block: string; taskId: string }[]; continuation: string },
		blockMap: Map<string, PirBlock>,
		nodeValues: Map<string, Value>,
		context: AsyncEvalContext,
	): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
		const branchPromises = term.branches.map(async (branch) => {
			const block = blockMap.get(branch.block);
			if (!block) {
				return {
					taskId: branch.taskId,
					result: errorVal(ErrorCodes.DomainError, `Fork block not found: ${branch.block}`)
				};
			}

			context.state.scheduler.spawn(branch.taskId, async () => {
				try {
					for (const instr of block.instructions) {
						const result = await this.execInstruction(instr, context.nodeMap, nodeValues, context);
						if (isError(result)) {
							return result;
						}
					}

					const termResult = await this.execTerminator(block.terminator, blockMap, nodeValues, context);
					if (termResult.done) {
						return termResult.value ?? voidVal();
					}

					return voidVal();
				} catch (error) {
					return errorVal(ErrorCodes.DomainError, `Fork branch error: ${String(error)}`);
				}
			});

			const result = await context.state.scheduler.await(branch.taskId);
			return { taskId: branch.taskId, result };
		});

		const results = await Promise.all(branchPromises);

		for (const { taskId, result } of results) {
			nodeValues.set(taskId, result);
		}

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
				if (term.results[i] !== undefined) {
					context.state.refCells.set(term.results[i]!, {
						kind: "refCell",
						value: results[i]!,
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
		const nodeValue = context.nodeValues.get(nodeId);
		if (nodeValue) {
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

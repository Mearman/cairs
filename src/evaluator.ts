// SPIRAL Evaluator
// Implements big-step evaluation: ρ ⊢ e ⇓ v

import { lookupOperator, type OperatorRegistry } from "./domains/registry.js";
import {
	Defs,
	ValueEnv,
	emptyValueEnv,
	extendValueEnv,
	lookupDef,
	lookupValue,
} from "./env.js";
import { SPIRALError, ErrorCodes, exhaustive } from "./errors.js";
import {
	type AIRDocument,
	type AirHybridNode,
	type BlockNode,
	type ClosureVal,
	type EIRDocument,
	type EirExpr,
	type EirHybridNode,
	type EvalState,
	type Expr,
	isBlockNode,
	isExprNode,
	type LirInstruction,
	type LirTerminator,
	type Node,
	type Type,
	type Value,
	voidVal,
	createEvalState,
	refCellVal,
} from "./types.js";
import {
	emptyEffectRegistry,
	lookupEffect,
	type EffectRegistry,
} from "./effects.js";
import {
	boolVal,
	closureVal,
	errorVal,
	floatVal,
	hashValue,
	intVal,
	isError,
	listVal,
	mapVal,
	opaqueVal,
	optionVal,
	setVal,
	stringVal,
	undefinedVal,
} from "./types.js";

//==============================================================================
// Evaluation Options
//==============================================================================

export interface EvalOptions {
	maxSteps?: number;
	trace?: boolean;
}

//==============================================================================
// Evaluator State
//==============================================================================

interface EvalContext {
	steps: number;
	maxSteps: number;
	trace: boolean;
}

//==============================================================================
// Evaluator Class
//==============================================================================

export class Evaluator {
	private readonly _registry: OperatorRegistry;
	private readonly _defs: Defs;

	constructor(registry: OperatorRegistry, defs: Defs) {
		this._registry = registry;
		this._defs = defs;
	}

	get registry(): OperatorRegistry {
		return this._registry;
	}

	get defs(): Defs {
		return this._defs;
	}

	/**
	 * Evaluate an expression: ρ ⊢ e ⇓ v
	 */
	evaluate(expr: Expr, env: ValueEnv, options?: EvalOptions): Value {
		const state: EvalContext = {
			steps: 0,
			maxSteps: options?.maxSteps ?? 10000,
			trace: options?.trace ?? false,
		};

		return this.evalExpr(expr, env, state);
	}

	/**
	 * Evaluate an expression with explicit state (for internal use by evalNode)
	 */
	evaluateWithState(expr: Expr, env: ValueEnv, state: EvalContext): Value {
		return this.evalExpr(expr, env, state);
	}

	/**
	 * E-Lit: ρ ⊢ lit(t, v) ⇓ v
	 */
	private evalExpr(expr: Expr, env: ValueEnv, state: EvalContext): Value {
		this.checkSteps(state);

		switch (expr.kind) {
		case "lit":
			return this.evalLit(expr);

		case "var":
			return this.evalVar(expr, env);

		case "ref": {
			// For inline expressions, ref could be a variable reference
			// Check environment first (for let-bound variables or lambda params)
			const refValue = env.get(expr.id);
			if (refValue) {
				return refValue;
			}
			// Otherwise, this is a node reference that should be resolved at program level
			throw new Error("Ref must be resolved during program evaluation");
		}

		case "call":
			return this.evalCall(expr, env, state);

		case "if":
			return this.evalIf(expr, env, state);

		case "let":
			return this.evalLet(expr, env, state);

		case "airRef":
			return this.evalAirRef();

		case "predicate":
			return this.evalPredicate();

		case "lambda":
			return this.evalLambda();

		case "callExpr":
			return this.evalCallExpr();

		case "fix":
			return this.evalFix();

		// PIR expressions - not supported in synchronous evaluator
		case "par":
		case "spawn":
		case "await":
		case "channel":
		case "send":
		case "recv":
		case "select":
		case "race":
			return errorVal(
				ErrorCodes.DomainError,
				"PIR expressions require AsyncEvaluator: " + expr.kind,
			);

		default:
			return exhaustive(expr);
		}
	}

	private evalLit(expr: { kind: "lit"; type: Type; value: unknown }): Value {
		const t = expr.type;
		const v = expr.value;

		switch (t.kind) {
		case "void":
			return voidVal();
		case "bool":
			return boolVal(Boolean(v));
		case "int":
			return intVal(Number(v));
		case "float":
			return floatVal(Number(v));
		case "string":
			return stringVal(String(v));
		case "list": {
			if (!Array.isArray(v))
				return errorVal(ErrorCodes.TypeError, "List value must be array");
			// Convert raw values to Value objects based on element type
			const listElementType = t.of;
			const listElements = (v as unknown[]).map(elem => {
				// Check if already a Value object first
				if (typeof elem === "object" && elem !== null && "kind" in elem) {
					const valObj = elem as { kind: string; value?: unknown };
					// Already a fully formed Value object - return as-is
					if ("value" in valObj) {
						// Convert to proper Value based on kind
						if (valObj.kind === "int") return intVal(Number(valObj.value));
						if (valObj.kind === "bool") return boolVal(Boolean(valObj.value));
						if (valObj.kind === "string") return stringVal(String(valObj.value));
						if (valObj.kind === "float") return floatVal(Number(valObj.value));
						return valObj as Value;
					}
				}
				// Raw primitive values - convert based on element type
				if (listElementType.kind === "int") return intVal(Number(elem));
				if (listElementType.kind === "bool") return boolVal(Boolean(elem));
				if (listElementType.kind === "string") return stringVal(String(elem));
				if (listElementType.kind === "float") return floatVal(Number(elem));
				return intVal(Number(elem)); // Default to int
			});
			return listVal(listElements);
		}

		case "set":
			if (!Array.isArray(v))
				return errorVal(ErrorCodes.TypeError, "Set value must be array");
			return setVal(new Set((v as Value[]).map(hashValue)));
		case "map":
			if (!Array.isArray(v))
				return errorVal(ErrorCodes.TypeError, "Map value must be array");
			return mapVal(
				new Map(
					(v as [Value, Value][]).map(([k, val]) => [hashValue(k), val]),
				),
			);
		case "option":
			return v === null ? optionVal(null) : optionVal(v as Value);
		case "opaque":
			return opaqueVal(t.name, v);
		default:
			return errorVal(
				ErrorCodes.TypeError,
				"Cannot create literal for type: " + t.kind,
			);
		}
	}

	/**
	 * E-Var: ρ(x) = v
	 *          -------
	 *          ρ ⊢ var(x) ⇓ v
	 */
	private evalVar(expr: { kind: "var"; name: string }, env: ValueEnv): Value {
		const value = lookupValue(env, expr.name);
		if (!value) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Unbound identifier: " + expr.name,
			);
		}
		return value;
	}

	/**
	 * E-Call: ρ ⊢ args[i] ⇓ vi    op(v1,...,vn) ⇓ v
	 *         ----------------------------------------
	 *                    ρ ⊢ call(ns:name, args) ⇓ v
	 */
	private evalCall(
		expr: { kind: "call"; ns: string; name: string; args: (string | Expr)[] },
		env: ValueEnv,
		state: EvalContext,
	): Value {
		// Check if args are node refs (strings) or inline expressions (objects)
		const hasInlineArgs = expr.args.some(arg => typeof arg !== "string");

		if (!hasInlineArgs) {
			// All args are node refs - this must be resolved during program evaluation
			throw new Error("Call must be resolved during program evaluation");
		}

		// Evaluate inline expression arguments and apply operator
		const argValues: Value[] = [];
		for (const arg of expr.args) {
			if (typeof arg === "string") {
				// Node ref - look up in environment (for let-bound variables)
				const value = env.get(arg);
				if (!value) {
					return errorVal(
						ErrorCodes.UnboundIdentifier,
						"Unbound identifier: " + arg,
					);
				}
				argValues.push(value);
			} else {
				// Inline expression - evaluate it
				const value = this.evalExpr(arg, env, state);
				if (isError(value)) {
					return value;
				}
				argValues.push(value);
			}
		}

		// Apply operator
		const op = lookupOperator(this._registry, expr.ns, expr.name);
		if (!op) {
			return errorVal(
				ErrorCodes.UnknownOperator,
				"Unknown operator: " + expr.ns + ":" + expr.name,
			);
		}

		// Check arity
		if (op.params.length !== argValues.length) {
			return errorVal(
				ErrorCodes.ArityError,
				`Arity mismatch: ${op.params.length} expected, ${argValues.length} given`,
			);
		}

		return op.fn(...argValues);
	}

	/**
	 * E-IfTrue: ρ ⊢ cond ⇓ true    ρ ⊢ then ⇓ v
	 *           -----------------------------
	 *                    ρ ⊢ if(cond, then, else) ⇓ v
	 *
	 * E-IfFalse: ρ ⊢ cond ⇓ false    ρ ⊢ else ⇓ v
	 *           ---------------------------------
	 *                    ρ ⊢ if(cond, then, else) ⇓ v
	 *
	 * E-IfCondErr: ρ ⊢ cond ⇓ Err
	 *           -------------------
	 *                    ρ ⊢ if(cond, then, else) ⇓ Err
	 */
	private evalIf(
		expr: { kind: "if"; cond: string | Expr; then: string | Expr; else: string | Expr; type?: Type },
		env: ValueEnv,
		state: EvalContext,
	): Value {
		// Check if branches are inline expressions
		const hasInlineExprs =
			typeof expr.cond !== "string" ||
			typeof expr.then !== "string" ||
			typeof expr.else !== "string";

		if (!hasInlineExprs) {
			// All are node refs - this must be resolved during program evaluation
			throw new Error("If must be resolved during program evaluation");
		}

		// Evaluate condition
		let condValue: Value;
		if (typeof expr.cond === "string") {
			const value = env.get(expr.cond);
			if (!value) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Unbound identifier: " + expr.cond,
				);
			}
			condValue = value;
		} else {
			condValue = this.evalExpr(expr.cond, env, state);
		}

		if (isError(condValue)) {
			return condValue;
		}

		// Check condition and evaluate appropriate branch
		if (condValue.kind === "bool" && condValue.value) {
			// Then branch
			if (typeof expr.then === "string") {
				const value = env.get(expr.then);
				if (!value) {
					return errorVal(
						ErrorCodes.UnboundIdentifier,
						"Unbound identifier: " + expr.then,
					);
				}
				return value;
			} else {
				return this.evalExpr(expr.then, env, state);
			}
		} else {
			// Else branch
			if (typeof expr.else === "string") {
				const value = env.get(expr.else);
				if (!value) {
					return errorVal(
						ErrorCodes.UnboundIdentifier,
						"Unbound identifier: " + expr.else,
					);
				}
				return value;
			} else {
				return this.evalExpr(expr.else, env, state);
			}
		}
	}

	/**
	 * E-Let: ρ ⊢ value ⇓ v1    ρ, x:v1 ⊢ body ⇓ v2
	 *        -----------------------------------------
	 *                ρ ⊢ let(x, value, body) ⇓ v2
	 *
	 * E-LetErr: ρ ⊢ value ⇓ Err
	 *           ----------------
	 *           ρ ⊢ let(x, value, body) ⇓ Err
	 */
	private evalLet(
		expr: { kind: "let"; name: string; value: string | Expr; body: string | Expr },
		env: ValueEnv,
		state: EvalContext,
	): Value {
		// Check if value and body are inline expressions
		const hasInlineExprs =
			typeof expr.value !== "string" ||
			typeof expr.body !== "string";

		if (!hasInlineExprs) {
			// All are node refs - this must be resolved during program evaluation
			throw new Error("Let must be resolved during program evaluation");
		}

		// Evaluate value
		let valueValue: Value;
		if (typeof expr.value === "string") {
			const value = env.get(expr.value);
			if (!value) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Unbound identifier: " + expr.value,
				);
			}
			valueValue = value;
		} else {
			valueValue = this.evalExpr(expr.value, env, state);
		}

		if (isError(valueValue)) {
			return valueValue;
		}

		// Extend environment with the binding
		const extendedEnv = extendValueEnv(env, expr.name, valueValue);

		// Evaluate body
		if (typeof expr.body === "string") {
			const value = extendedEnv.get(expr.body);
			if (!value) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Unbound identifier: " + expr.body,
				);
			}
			return value;
		} else {
			return this.evalExpr(expr.body, extendedEnv, state);
		}
	}

	/**
	 * E-AirRef: Capture-avoiding inlining of airDef body
	 */
	private evalAirRef(): Value {
		// Arguments are node refs, resolved during program evaluation
		throw new Error("AirRef must be resolved during program evaluation");
	}

	/**
	 * E-Pred: Create a predicate value
	 */
	private evalPredicate(): Value {
		// Value is a node ref, resolved during program evaluation
		throw new Error("Predicate must be resolved during program evaluation");
	}

	/**
	 * E-Λ: ρ ⊢ lambda(params, body) ⇓ ⟨params, body, ρ⟩
	 */
	private evalLambda(): Value {
		// Body is a node ref, resolved during program evaluation
		throw new Error("Lambda must be resolved during program evaluation");
	}

	/**
	 * E-CallExpr: ρ ⊢ fn ⇓ ⟨params, body, ρ'⟩    ρ ⊢ args[i] ⇓ vi
	 *             ρ', params:vi ⊢ body ⇓ v
	 *             -----------------------------------------
	 *                      ρ ⊢ callExpr(fn, args) ⇓ v
	 */
	private evalCallExpr(): Value {
		// Fn and args are node refs, resolved during program evaluation
		throw new Error("CallExpr must be resolved during program evaluation");
	}

	/**
	 * E-Fix: ρ ⊢ fn ⇓ ⟨[x], body, ρ'⟩    ρ', x:fix(fn) ⊢ body ⇓ v
	 *        --------------------------------------------------
	 *                      ρ ⊢ fix(fn) ⇓ v
	 */
	private evalFix(): Value {
		// Fn is a node ref, resolved during program evaluation
		throw new Error("Fix must be resolved during program evaluation");
	}

	private checkSteps(state: EvalContext): void {
		state.steps++;
		if (state.steps > state.maxSteps) {
			throw SPIRALError.nonTermination();
		}
	}
}

//==============================================================================
// Program Evaluation
//==============================================================================

/**
 * Evaluate a full AIR/CIR program.
 */
export function evaluateProgram(
	doc: AIRDocument,
	registry: OperatorRegistry,
	defs: Defs,
	inputs?: Map<string, Value>,
	options?: EvalOptions,
): Value {
	const evaluator = new Evaluator(registry, defs);
	const nodeMap = new Map<string, AirHybridNode>();
	const nodeValues = new Map<string, Value>();

	// Build a map of nodes and find nodes that are "bound" (referenced as body in let/if/lambda)
	const boundNodes = new Set<string>();

	// First pass: build nodeMap
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	// Collect all lambda parameters in the document
	const allLambdaParams = new Set<string>();
	for (const node of doc.nodes) {
		// Only expr nodes can have lambda expressions
		if (isExprNode(node) && node.expr.kind === "lambda" && Array.isArray(node.expr.params)) {
			for (const p of node.expr.params) {
				if (typeof p === "string") allLambdaParams.add(p);
			}
		}
	}

	// Helper to check if an expression uses any lambda parameters
	const usesLambdaParams = (expr: Expr): boolean => {
		if (expr.kind === "callExpr") {
			if (typeof expr.fn === "string" && allLambdaParams.has(expr.fn)) return true;
			for (const arg of expr.args) {
				if (typeof arg === "string" && allLambdaParams.has(arg)) return true;
			}
		} else if (expr.kind === "call") {
			for (const arg of expr.args) {
				if (typeof arg === "string" && allLambdaParams.has(arg)) return true;
			}
		} else if (expr.kind === "ref") {
			if (allLambdaParams.has(expr.id)) return true;
		}
		return false;
	};

	// Second pass: mark bound nodes using transitive closure
	// A node is bound if it actually needs context to be evaluated
	// We only mark non-trivial nodes recursively
	const isTrivalNode = (node: AirHybridNode | undefined): boolean => {
		if (!node) return true;
		// Block nodes are not trivial - they need to be evaluated
		if (isBlockNode(node)) return false;
		const expr = node.expr;
		// Literals and refs to already-evaluated nodes are trivial
		return expr.kind === "lit" || expr.kind === "airRef";
	};

	// Check if an expression references any bound nodes in its arguments
	const usesBoundNodes = (expr: Expr): boolean => {
		if (expr.kind === "call") {
			const callExpr = expr as { kind: "call"; args: string[] };
			for (const arg of callExpr.args) {
				if (boundNodes.has(arg)) return true;
			}
		} else if (expr.kind === "callExpr") {
			const callExpr = expr as { kind: "callExpr"; fn: string; args: string[] };
			if (boundNodes.has(callExpr.fn)) return true;
			for (const arg of callExpr.args) {
				if (boundNodes.has(arg)) return true;
			}
		} else if (expr.kind === "ref") {
			if (boundNodes.has(expr.id)) return true;
		}
		return false;
	};

	const markBoundRecursively = (nodeId: string): void => {
		if (boundNodes.has(nodeId)) return;
		const node = nodeMap.get(nodeId);
		if (!node) return;

		// Don't mark trivial nodes as bound
		if (isTrivalNode(node)) return;

		boundNodes.add(nodeId);

		// Block nodes don't have expressions to traverse
		if (isBlockNode(node)) return;

		// Recursively mark children that depend on context
		const expr = node.expr;
		if (expr.kind === "let") {
			const letExpr = expr as { kind: "let"; name: string; value: string; body: string };
			// Mark the body (it may reference the let-bound variable)
			if (typeof letExpr.body === "string") {
				markBoundRecursively(letExpr.body);
			}
		} else if (expr.kind === "if") {
			const ifExpr = expr as { kind: "if"; cond: string; then: string; else: string };
			// Mark branches (they may reference let-bound variables or lambda params)
			if (typeof ifExpr.then === "string") {
				markBoundRecursively(ifExpr.then);
			}
			if (typeof ifExpr.else === "string") {
				markBoundRecursively(ifExpr.else);
			}
		}
	};

	// First pass: mark initial bound nodes
	for (const node of doc.nodes) {
		// Block nodes don't have expressions - skip binding analysis
		if (isBlockNode(node)) continue;
		const expr = node.expr;
		// Lambda bodies are bound - start the recursive marking
		if (expr.kind === "lambda" && typeof expr.body === "string") {
			markBoundRecursively(expr.body);
		}
		// Nodes that use lambda parameters should be evaluated in context, not at top level
		if (usesLambdaParams(expr)) {
			boundNodes.add(node.id);
		}
		// Var nodes should also be skipped - they're meant to be evaluated in let-bound contexts
		if (expr.kind === "var") {
			boundNodes.add(node.id);
		}
	}

	// Second pass: transitively mark nodes that reference bound nodes
	// Repeat until no new bound nodes are found
	let changed = true;
	while (changed) {
		changed = false;
		for (const node of doc.nodes) {
			if (boundNodes.has(node.id)) continue;
			if (isTrivalNode(node)) continue;
			// Block nodes don't use bound nodes in expressions
			if (isBlockNode(node)) continue;
			if (usesBoundNodes(node.expr)) {
				boundNodes.add(node.id);
				changed = true;
			}
		}
	}

	// Third pass: find ref nodes that point to var or call nodes and mark them as bound
	// These need to be evaluated in the correct let-bound context
	for (const node of doc.nodes) {
		if (isBlockNode(node)) continue;
		const expr = node.expr;
		if (expr.kind === "ref") {
			const refNode = nodeMap.get(expr.id);
			if (refNode && isExprNode(refNode) && (refNode.expr.kind === "var" || refNode.expr.kind === "call")) {
				boundNodes.add(node.id);
			}
		}
	}

	// Start with input environment
	let env = inputs ?? emptyValueEnv();


	// Evaluate each node in order (except bound nodes)
	for (const node of doc.nodes) {
		// Skip nodes that are bound by let/if/lambda - they'll be evaluated when needed
		if (boundNodes.has(node.id)) {
			continue;
		}

		const result = evalNode(evaluator, node, nodeMap, nodeValues, env, options);
		nodeValues.set(node.id, result.value);

		// Propagate errors
		if (isError(result.value)) {
			return result.value;
		}

		env = result.env;
	}

	// Return the result node's value
	const resultValue = nodeValues.get(doc.result);
	if (!resultValue) {
		// If result node hasn't been evaluated, it might be a bound node
		const resultNode = nodeMap.get(doc.result);
		if (resultNode) {
			const result = evalNode(
				evaluator,
				resultNode,
				nodeMap,
				nodeValues,
				env,
				options,
			);
			return result.value;
		}
		return errorVal(
			ErrorCodes.DomainError,
			"Result node not evaluated: " + doc.result,
		);
	}

	return resultValue;
}

interface NodeEvalResult {
	value: Value;
	env: ValueEnv;
}

/**
 * Evaluate an expression with access to nodeMap for resolving node references.
 * This is used when evaluating closure bodies that may contain node references.
 */
function evalExprWithNodeMap(
	registry: OperatorRegistry,
	defs: Defs,
	expr: Expr,
	nodeMap: Map<string, AirHybridNode>,
	nodeValues: Map<string, Value>,
	env: ValueEnv,
	options?: EvalOptions,
): Value {
	// Handle different expression kinds
	if (expr.kind === "lambda") {
		const lambdaExpr = expr as { kind: "lambda"; params: (string | { name: string; optional?: boolean; default?: Expr })[]; body: string; type: Type };
		const bodyNode = nodeMap.get(lambdaExpr.body);
		if (!bodyNode) {
			return errorVal(ErrorCodes.DomainError, "Lambda body node not found: " + lambdaExpr.body);
		}
		if (isBlockNode(bodyNode)) {
			// Block node as lambda body - not currently supported
			return errorVal(ErrorCodes.DomainError, "Block nodes as lambda bodies are not supported");
		}
		// Convert params to LambdaParam format
		const lambdaParams: import("./types.js").LambdaParam[] = lambdaExpr.params.map(p =>
			typeof p === "string" ? { name: p } : p
		);
		return closureVal(lambdaParams, bodyNode.expr, env);
	}

	if (expr.kind === "callExpr") {
		const callExpr = expr as { kind: "callExpr"; fn: string; args: string[] };
		// Look up function: first in nodeValues, then in environment
		let fnValue: Value | undefined = nodeValues.get(callExpr.fn);
		fnValue ??= lookupValue(env, callExpr.fn);
		// If not found, try evaluating the fn node (it might be a var referencing a param)
		if (!fnValue) {
			const fnNode = nodeMap.get(callExpr.fn);
			if (fnNode) {
				if (isBlockNode(fnNode)) {
					fnValue = evaluateBlockNode(fnNode, registry, nodeMap, nodeValues, env, options);
				} else {
					fnValue = evalExprWithNodeMap(registry, defs, fnNode.expr, nodeMap, nodeValues, env, options);
				}
			}
		}
		if (!fnValue) {
			return errorVal(ErrorCodes.DomainError, "Function not found: " + callExpr.fn);
		}
		if (isError(fnValue)) {
			return fnValue;
		}
		if (fnValue.kind !== "closure") {
			return errorVal(ErrorCodes.TypeError, "Expected closure, got: " + fnValue.kind);
		}

		// Get argument values
		const argValues: Value[] = [];
		for (const argId of callExpr.args) {
			let argValue = nodeValues.get(argId);
			argValue ??= lookupValue(env, argId);
			// If not in nodeValues or env, try evaluating the node with current env
			if (!argValue) {
				const argNode = nodeMap.get(argId);
				if (argNode) {
					if (isBlockNode(argNode)) {
						argValue = evaluateBlockNode(argNode, registry, nodeMap, nodeValues, env, options);
					} else {
						argValue = evalExprWithNodeMap(registry, defs, argNode.expr, nodeMap, nodeValues, env, options);
					}
				}
			}
			if (!argValue) {
				return errorVal(ErrorCodes.DomainError, "Argument not found: " + argId);
			}
			if (isError(argValue)) {
				return argValue;
			}
			argValues.push(argValue);
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

		// Extend environment with parameters
		let callEnv = fnValue.env;
		for (let i = 0; i < fnValue.params.length; i++) {
			const param = fnValue.params[i];
			if (param === undefined) {
				return errorVal(
					ErrorCodes.ValidationError,
					`Parameter at index ${i} is undefined`,
				);
			}
			const argValue = argValues[i];

			if (argValue !== undefined) {
				// Provided argument - use it
				callEnv = extendValueEnv(callEnv, param.name, argValue);
			} else if (param.optional) {
				// Omitted optional param - check for default or use undefined
				if (param.default !== undefined) {
					// Evaluate default expression in closure's defining environment
					const defaultVal = evalExprWithNodeMap(
						registry,
						defs,
						param.default,
						nodeMap,
						nodeValues,
						fnValue.env,
						options,
					);
					if (isError(defaultVal)) {
						return defaultVal;
					}
					callEnv = extendValueEnv(callEnv, param.name, defaultVal);
				} else {
					// Optional without default = undefined
					callEnv = extendValueEnv(callEnv, param.name, undefinedVal());
				}
			} else {
				// Required param not provided
				return errorVal(
					ErrorCodes.ArityError,
					`Missing required parameter: ${param.name}`,
				);
			}
		}

		// Recursively evaluate the closure body
		return evalExprWithNodeMap(registry, defs, fnValue.body, nodeMap, nodeValues, callEnv, options);
	}

	if (expr.kind === "ref") {
		const refExpr = expr as { kind: "ref"; id: string };
		// Look up in nodeValues first, then environment
		let value = nodeValues.get(refExpr.id);
		value ??= lookupValue(env, refExpr.id);
		if (!value) {
			return errorVal(ErrorCodes.DomainError, "Reference not found: " + refExpr.id);
		}
		return value;
	}

	if (expr.kind === "call") {
		const callExpr = expr as { kind: "call"; ns: string; name: string; args: string[] };
		// Get argument values
		const argValues: Value[] = [];
		for (const argId of callExpr.args) {
			let argValue = nodeValues.get(argId);
			argValue ??= lookupValue(env, argId);
			// If not found, try evaluating the arg node (it might be a bound node like var)
			if (!argValue) {
				const argNode = nodeMap.get(argId);
				if (argNode) {
					if (isBlockNode(argNode)) {
						argValue = evaluateBlockNode(argNode, registry, nodeMap, nodeValues, env, options);
					} else {
						argValue = evalExprWithNodeMap(registry, defs, argNode.expr, nodeMap, nodeValues, env, options);
					}
				}
			}
			if (!argValue) {
				return errorVal(ErrorCodes.DomainError, "Argument not found: " + argId);
			}
			if (isError(argValue)) {
				return argValue;
			}
			argValues.push(argValue);
		}

		// Look up and apply the operator (try built-in registry first, then airDefs)
		const op = lookupOperator(registry, callExpr.ns, callExpr.name);
		if (op) {
			if (op.params.length !== argValues.length) {
				return errorVal(ErrorCodes.ArityError, "Arity error: " + callExpr.ns + ":" + callExpr.name);
			}
			try {
				return op.fn(...argValues);
			} catch (e) {
				if (e instanceof SPIRALError) {
					return e.toValue();
				}
				return errorVal(ErrorCodes.DomainError, String(e));
			}
		}

		// Try airDef lookup
		const def = lookupDef(defs, callExpr.ns, callExpr.name);
		if (def) {
			if (def.params.length !== argValues.length) {
				return errorVal(ErrorCodes.ArityError, "Arity error: " + callExpr.ns + ":" + callExpr.name);
			}
			// Create environment with parameters bound to argument values
			let defEnv: ValueEnv = env;
			for (let i = 0; i < def.params.length; i++) {
				const paramName = def.params[i];
				const argValue = argValues[i];
				if (paramName !== undefined && argValue !== undefined) {
					defEnv = extendValueEnv(defEnv, paramName, argValue);
				}
			}
			// Evaluate the airDef body
			return evalExprWithNodeMap(registry, defs, def.body, nodeMap, nodeValues, defEnv, options);
		}

		return errorVal(ErrorCodes.UnknownOperator, "Unknown operator: " + callExpr.ns + ":" + callExpr.name);
	}

	if (expr.kind === "let") {
		const letExpr = expr as { kind: "let"; name: string; value: string; body: string };
		// Evaluate the value
		let valueResult: Value | undefined;
		// First check if value is in nodeValues or environment
		valueResult = nodeValues.get(letExpr.value) ?? lookupValue(env, letExpr.value);
		if (!valueResult) {
			// Try evaluating the value node
			const valueNode = nodeMap.get(letExpr.value);
			if (valueNode) {
				if (isBlockNode(valueNode)) {
					valueResult = evaluateBlockNode(valueNode, registry, nodeMap, nodeValues, env, options);
				} else {
					valueResult = evalExprWithNodeMap(registry, defs, valueNode.expr, nodeMap, nodeValues, env, options);
				}
			}
		}
		if (!valueResult) {
			return errorVal(ErrorCodes.DomainError, "Let value not found: " + letExpr.value);
		}
		if (isError(valueResult)) {
			return valueResult;
		}

		// Extend environment with the let binding
		const letEnv = extendValueEnv(env, letExpr.name, valueResult);

		// Evaluate the body - always pass letEnv even if body was already evaluated
		const bodyNode = nodeMap.get(letExpr.body);
		if (!bodyNode) {
			return errorVal(ErrorCodes.DomainError, "Let body node not found: " + letExpr.body);
		}
		// Always evaluate with letEnv to ensure let bindings are available
		let bodyResult: Value;
		if (isBlockNode(bodyNode)) {
			bodyResult = evaluateBlockNode(bodyNode, registry, nodeMap, nodeValues, letEnv, options);
		} else {
			bodyResult = evalExprWithNodeMap(registry, defs, bodyNode.expr, nodeMap, nodeValues, letEnv, options);
		}
		return bodyResult;
	}

	if (expr.kind === "if") {
		const ifExpr = expr as { kind: "if"; cond: string; then: string; else: string; type?: Type };
		// Evaluate the condition
		let condValue = nodeValues.get(ifExpr.cond) ?? lookupValue(env, ifExpr.cond);
		if (!condValue) {
			const condNode = nodeMap.get(ifExpr.cond);
			if (condNode) {
				if (isBlockNode(condNode)) {
					condValue = evaluateBlockNode(condNode, registry, nodeMap, nodeValues, env, options);
				} else {
					condValue = evalExprWithNodeMap(registry, defs, condNode.expr, nodeMap, nodeValues, env, options);
				}
			}
		}
		if (!condValue) {
			return errorVal(ErrorCodes.DomainError, "Condition node not evaluated: " + ifExpr.cond);
		}
		if (isError(condValue)) {
			return condValue;
		}
		if (condValue.kind !== "bool") {
			return errorVal(ErrorCodes.TypeError, "Condition must be boolean, got: " + condValue.kind);
		}

		// Evaluate the appropriate branch
		const branchId = condValue.value ? ifExpr.then : ifExpr.else;
		let branchValue = nodeValues.get(branchId) ?? lookupValue(env, branchId);
		if (!branchValue) {
			const branchNode = nodeMap.get(branchId);
			if (branchNode) {
				if (isBlockNode(branchNode)) {
					branchValue = evaluateBlockNode(branchNode, registry, nodeMap, nodeValues, env, options);
				} else {
					branchValue = evalExprWithNodeMap(registry, defs, branchNode.expr, nodeMap, nodeValues, env, options);
				}
			}
		}
		if (!branchValue) {
			return errorVal(ErrorCodes.DomainError, "Branch node not evaluated: " + branchId);
		}
		return branchValue;
	}

	if (expr.kind === "var") {
		const varExpr = expr as { kind: "var"; name: string };
		const value = lookupValue(env, varExpr.name);
		if (!value) {
			return errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + varExpr.name);
		}
		return value;
	}

	if (expr.kind === "lit") {
		const litExpr = expr as { kind: "lit"; type: Type; value: unknown };
		// Convert literal value to Value
		if (litExpr.type.kind === "int") {
			return intVal(litExpr.value as number);
		} else if (litExpr.type.kind === "bool") {
			return boolVal(litExpr.value as boolean);
		} else if (litExpr.type.kind === "string") {
			return stringVal(litExpr.value as string);
		} else if (litExpr.type.kind === "float") {
			return floatVal(litExpr.value as number);
		} else if (litExpr.type.kind === "list") {
			// Handle list literals
			const elements = litExpr.value as unknown[];
			const values: Value[] = elements.map(elem => {
				if (typeof elem === "number") return intVal(elem);
				if (typeof elem === "boolean") return boolVal(elem);
				if (typeof elem === "string") return stringVal(elem);
				return errorVal(ErrorCodes.DomainError, "Unsupported list element type");
			});
			// Check if any element evaluation resulted in an error
			for (const v of values) {
				if (isError(v)) return v;
			}
			return listVal(values);
		}
		return errorVal(ErrorCodes.DomainError, "Unsupported literal type: " + litExpr.type.kind);
	}

	// For other expression types, return an error
	return errorVal(ErrorCodes.DomainError, "Unsupported expression kind in closure body: " + expr.kind);
}

//==============================================================================
// Block Node Evaluation
// Evaluates CFG-based block nodes within AIR/CIR/EIR documents
//==============================================================================

/**
 * Evaluate a block node (CFG structure) and return its result.
 * Block nodes contain basic blocks with instructions and terminators.
 */
function evaluateBlockNode<B extends { id: string; instructions: unknown[]; terminator: LirTerminator }>(
	node: BlockNode<B>,
	registry: OperatorRegistry,
	nodeMap: Map<string, AirHybridNode>,
	nodeValues: Map<string, Value>,
	env: ValueEnv,
	options?: EvalOptions,
): Value {
	// Build block map
	const blockMap = new Map<string, B>();
	for (const block of node.blocks) {
		blockMap.set(block.id, block);
	}

	// Find entry block
	const entryBlock = blockMap.get(node.entry);
	if (!entryBlock) {
		return errorVal(ErrorCodes.ValidationError, "Entry block not found: " + node.entry);
	}

	// Runtime state
	let vars: ValueEnv = env;
	let steps = 0;
	const maxSteps = options?.maxSteps ?? 10000;

	// Execute CFG
	let currentBlockId = node.entry;
	while (currentBlockId) {
		steps++;
		if (steps > maxSteps) {
			return errorVal(ErrorCodes.NonTermination, "Block node execution exceeded maximum steps");
		}

		const currentBlock = blockMap.get(currentBlockId);
		if (!currentBlock) {
			return errorVal(ErrorCodes.ValidationError, "Block not found: " + currentBlockId);
		}

		// Execute instructions
		for (const ins of currentBlock.instructions as LirInstruction[]) {
			const result = executeBlockInstruction(ins, vars, registry, nodeMap, nodeValues);
			if (result.error) {
				return result.error;
			}
			vars = result.vars;
		}

		// Execute terminator
		const termResult = executeBlockTerminator(currentBlock.terminator, vars, nodeValues);
		if (termResult.returnValue !== undefined) {
			return termResult.returnValue;
		}
		if (termResult.error) {
			return termResult.error;
		}
		if (termResult.nextBlock === undefined) {
			return errorVal(
				ErrorCodes.ValidationError,
				"Terminator returned without nextBlock, returnValue, or error",
			);
		}
		currentBlockId = termResult.nextBlock;
	}

	return voidVal();
}

interface BlockInstructionResult {
	vars: ValueEnv;
	error?: Value;
}

function executeBlockInstruction(
	ins: LirInstruction,
	vars: ValueEnv,
	registry: OperatorRegistry,
	_nodeMap: Map<string, AirHybridNode>,
	nodeValues: Map<string, Value>,
): BlockInstructionResult {
	switch (ins.kind) {
	case "assign": {
		// Evaluate the expression value
		const expr = ins.value;
		let value: Value;
		if (expr.kind === "lit") {
			value = evaluateLitExpr(expr);
		} else if (expr.kind === "var") {
			const varVal = lookupValue(vars, expr.name);
			value = varVal ?? errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
		} else if (expr.kind === "ref") {
			// Reference to another node
			value = nodeValues.get(expr.id) ?? errorVal(ErrorCodes.DomainError, "Node not found: " + expr.id);
		} else {
			value = errorVal(ErrorCodes.DomainError, "Unsupported expression in block assign: " + expr.kind);
		}
		if (isError(value)) {
			return { vars, error: value };
		}
		return { vars: extendValueEnv(vars, ins.target, value) };
	}

	case "op": {
		// Look up argument values
		const argValues: Value[] = [];
		for (const argId of ins.args) {
			const argVal = lookupValue(vars, argId) ?? nodeValues.get(argId);
			if (!argVal) {
				return { vars, error: errorVal(ErrorCodes.UnboundIdentifier, "Argument not found: " + argId) };
			}
			if (isError(argVal)) {
				return { vars, error: argVal };
			}
			argValues.push(argVal);
		}

		// Look up operator
		const op = lookupOperator(registry, ins.ns, ins.name);
		if (!op) {
			return { vars, error: errorVal(ErrorCodes.UnknownOperator, "Unknown operator: " + ins.ns + ":" + ins.name) };
		}

		try {
			const result = op.fn(...argValues);
			return { vars: extendValueEnv(vars, ins.target, result) };
		} catch (e) {
			if (e instanceof SPIRALError) {
				return { vars, error: e.toValue() };
			}
			return { vars, error: errorVal(ErrorCodes.DomainError, String(e)) };
		}
	}

	case "phi": {
		// Phi nodes are handled by looking up the first source with a value
		let phiValue: Value | undefined;
		for (const source of ins.sources) {
			const value = lookupValue(vars, source.id);
			if (value && !isError(value)) {
				phiValue = value;
				break;
			}
		}
		if (!phiValue) {
			return { vars, error: errorVal(ErrorCodes.DomainError, "Phi node has no valid sources: " + ins.target) };
		}
		return { vars: extendValueEnv(vars, ins.target, phiValue) };
	}

	case "call":
	case "effect":
	case "assignRef":
		// These are not commonly used in AIR/CIR blocks, but we can provide basic support
		return { vars, error: errorVal(ErrorCodes.DomainError, "Instruction kind not yet supported in hybrid blocks: " + ins.kind) };

	default:
		return { vars, error: errorVal(ErrorCodes.DomainError, "Unknown instruction kind") };
	}
}

interface BlockTerminatorResult {
	nextBlock?: string;
	returnValue?: Value;
	error?: Value;
}

function executeBlockTerminator(
	term: LirTerminator,
	vars: ValueEnv,
	nodeValues: Map<string, Value>,
): BlockTerminatorResult {
	switch (term.kind) {
	case "jump":
		return { nextBlock: term.to };

	case "branch": {
		const condValue = lookupValue(vars, term.cond) ?? nodeValues.get(term.cond);
		if (!condValue) {
			return { error: errorVal(ErrorCodes.UnboundIdentifier, "Condition not found: " + term.cond) };
		}
		if (condValue.kind !== "bool") {
			return { error: errorVal(ErrorCodes.TypeError, "Branch condition must be bool") };
		}
		return { nextBlock: condValue.value ? term.then : term.else };
	}

	case "return": {
		if (term.value) {
			const value = lookupValue(vars, term.value) ?? nodeValues.get(term.value);
			if (!value) {
				return { error: errorVal(ErrorCodes.UnboundIdentifier, "Return value not found: " + term.value) };
			}
			return { returnValue: value };
		}
		return { returnValue: voidVal() };
	}

	case "exit":
		return { returnValue: voidVal() };

	default:
		return { error: errorVal(ErrorCodes.DomainError, "Unknown terminator kind") };
	}
}

function evaluateLitExpr(expr: { kind: "lit"; type: Type; value: unknown }): Value {
	switch (expr.type.kind) {
	case "bool":
		return boolVal(Boolean(expr.value));
	case "int":
		return intVal(Number(expr.value));
	case "float":
		return floatVal(Number(expr.value));
	case "string":
		return stringVal(String(expr.value));
	case "void":
		return voidVal();
	default:
		return errorVal(ErrorCodes.TypeError, "Complex literals not yet supported in blocks");
	}
}

function evalNode(
	evaluator: Evaluator,
	node: AirHybridNode,
	nodeMap: Map<string, AirHybridNode>,
	nodeValues: Map<string, Value>,
	env: ValueEnv,
	options?: EvalOptions,
): NodeEvalResult {
	const state: EvalContext = {
		steps: 0,
		maxSteps: options?.maxSteps ?? 10000,
		trace: options?.trace ?? false,
	};

	// Handle block nodes - evaluate CFG and return result
	if (isBlockNode(node)) {
		const result = evaluateBlockNode(node, evaluator.registry, nodeMap, nodeValues, env, options);
		return { value: result, env };
	}

	// Expression node - evaluate normally
	const expr = node.expr;

	switch (expr.kind) {
	case "lit": {
		const value = evaluator.evaluateWithState(expr, env, state);
		return { value, env };
	}

	case "var": {
		const value = evaluator.evaluateWithState(expr, env, state);
		return { value, env };
	}

	case "ref": {
		// Look up the referenced node's value
		let value = nodeValues.get(expr.id);

		// If not in nodeValues, try to evaluate the node with the current environment
		// This handles var nodes and other nodes that were skipped in the main loop
		if (!value) {
			const refNode = nodeMap.get(expr.id);
			if (refNode) {
				const refResult = evalNode(
					evaluator,
					refNode,
					nodeMap,
					nodeValues,
					env,
					options,
				);
				value = refResult.value;
			} else {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Referenced node not found: " + expr.id,
					),
					env,
				};
			}
		}
		return { value, env };
	}

	case "call": {
		// Evaluate arguments and apply operator
		const argValues: Value[] = [];
		let currentEnv = env; // Track environment through argument evaluation
		for (const arg of expr.args) {
			let argValue: Value | undefined;

			// Handle both string IDs (node refs) and inline expression objects
			if (typeof arg === "string") {
				// Node reference - get value from nodeMap/nodeValues
				const argNode = nodeMap.get(arg);
				const isVarNode = argNode && isExprNode(argNode) && argNode.expr.kind === "var";
				const isLetNode = argNode && isExprNode(argNode) && argNode.expr.kind === "let";
				const isCallNode = argNode && isExprNode(argNode) && argNode.expr.kind === "call";

				// First try to get the value from nodeValues (for already-evaluated nodes)
				// But skip error values, var nodes, let nodes, and call nodes since they need fresh evaluation
				// with the correct environment
				argValue = nodeValues.get(arg);
				if (argValue && (isError(argValue) || isVarNode || isLetNode || isCallNode)) {
					argValue = undefined; // Force re-evaluation for nodes that need environment context
				}

				// If not in nodeValues (or was an error/var/let/call node), try to evaluate the node
				if (!argValue) {
					if (argNode) {
						// Try to evaluate the node with the current environment
						// This handles var, lit, ref, let, and call nodes correctly
						const argResult = evalNode(
							evaluator,
							argNode,
							nodeMap,
							nodeValues,
							currentEnv,
							options,
						);
						argValue = argResult.value;
						// For let nodes, cache the value (but not for call nodes to avoid environment issues)
						// and update currentEnv to capture bindings
						if (isLetNode && !isError(argValue)) {
							nodeValues.set(arg, argValue);
							currentEnv = argResult.env;
						}
					}
				}

				// If still not found, try looking up as a variable in the environment
				argValue ??= lookupValue(currentEnv, arg);

				if (!argValue) {
					return {
						value: errorVal(
							ErrorCodes.DomainError,
							"Argument not found: " + arg,
						),
						env: currentEnv,
					};
				}
			} else {
				// Inline expression - evaluate it directly
				argValue = evaluator.evaluateWithState(arg, currentEnv, state);
			}

			if (isError(argValue)) {
				return { value: argValue, env: currentEnv };
			}
			argValues.push(argValue);
		}

		const op = lookupOperator(evaluator.registry, expr.ns, expr.name);
		if (!op) {
			return {
				value: errorVal(
					ErrorCodes.UnknownOperator,
					"Unknown operator: " + expr.ns + ":" + expr.name,
				),
				env: currentEnv,
			};
		}

		// Check arity
		if (op.params.length !== argValues.length) {
			return {
				value: errorVal(
					ErrorCodes.ArityError,
					"Arity error: " + expr.ns + ":" + expr.name,
				),
				env: currentEnv,
			};
		}

		// Apply operator
		try {
			const value = op.fn(...argValues);
			return { value, env: currentEnv };
		} catch (e) {
			if (e instanceof SPIRALError) {
				return { value: e.toValue(), env: currentEnv };
			}
			return { value: errorVal(ErrorCodes.DomainError, String(e)), env: currentEnv };
		}
	}

	case "if": {
		// Look up condition in nodeValues first, then in environment (for let-bound variables)
		let condValue = nodeValues.get(expr.cond);
		condValue ??= lookupValue(env, expr.cond);
		// If still not found, try evaluating the condition node with current env
		if (!condValue) {
			const condNode = nodeMap.get(expr.cond);
			if (condNode) {
				const condResult = evalNode(evaluator, condNode, nodeMap, nodeValues, env, options);
				condValue = condResult.value;
			}
		}
		if (!condValue) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Condition node not evaluated: " + expr.cond,
				),
				env,
			};
		}
		if (isError(condValue)) {
			return { value: condValue, env };
		}

		const branchId =
				condValue.kind === "bool" && condValue.value ? expr.then : expr.else;

		// Try to get branch value from nodeValues or environment first
		let branchValue = nodeValues.get(branchId);
		branchValue ??= lookupValue(env, branchId);
		if (branchValue) {
			return { value: branchValue, env };
		}

		// Otherwise, evaluate the branch node
		const branchNode = nodeMap.get(branchId);
		if (!branchNode) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Branch node not found: " + branchId,
				),
				env,
			};
		}

		// Evaluate the branch node directly (it might be a bound node not in nodeValues)
		const branchResult = evalNode(
			evaluator,
			branchNode,
			nodeMap,
			nodeValues,
			env,
			options,
		);
		return { value: branchResult.value, env };
	}

	case "let": {
		// Handle both node references (strings) and inline expressions (objects)
		let valueNodeValue: Value | undefined;

		if (typeof expr.value === "string") {
			// Node reference - look up in nodeValues first
			valueNodeValue = nodeValues.get(expr.value);
			// If not found, try to evaluate the value node (it might be a bound node)
			if (!valueNodeValue) {
				const valueNode = nodeMap.get(expr.value);
				if (valueNode) {
					if (isBlockNode(valueNode)) {
						// Block node - evaluate CFG
						valueNodeValue = evaluateBlockNode(valueNode, evaluator.registry, nodeMap, nodeValues, env, options);
					} else {
						// Use evalExprWithNodeMap to properly handle bound nodes
						valueNodeValue = evalExprWithNodeMap(
							evaluator.registry,
							evaluator.defs,
							valueNode.expr,
							nodeMap,
							nodeValues,
							env,
							options,
						);
					}
				}
			}
			if (!valueNodeValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Value node not evaluated: " + expr.value,
					),
					env,
				};
			}
		} else {
			// Inline expression - evaluate it directly
			valueNodeValue = evaluator.evaluateWithState(expr.value, env, state);
		}

		if (isError(valueNodeValue)) {
			return { value: valueNodeValue, env };
		}

		const extendedEnv = extendValueEnv(env, expr.name, valueNodeValue);

		// Get the body and evaluate it with the extended environment
		if (typeof expr.body === "string") {
			// Node reference
			const bodyNode = nodeMap.get(expr.body);
			if (!bodyNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Body node not found: " + expr.body,
					),
					env,
				};
			}

			// Handle block nodes
			if (isBlockNode(bodyNode)) {
				const blockResult = evaluateBlockNode(bodyNode, evaluator.registry, nodeMap, nodeValues, extendedEnv, options);
				return { value: blockResult, env: extendedEnv };
			}

			// Handle var expressions - look up directly in extended environment
			if (bodyNode.expr.kind === "var") {
				const varExpr = bodyNode.expr as { kind: "var"; name: string };
				const varValue = lookupValue(extendedEnv, varExpr.name);
				if (varValue) {
					return { value: varValue, env: extendedEnv };
				}
				return {
					value: errorVal(
						ErrorCodes.UnboundIdentifier,
						"Unbound identifier: " + varExpr.name,
					),
					env: extendedEnv,  // Return extendedEnv even on error to preserve bindings
				};
			}

			// Handle lit expressions - just return the literal value
			if (bodyNode.expr.kind === "lit") {
				const litExpr = bodyNode.expr;
				const litValue = evaluator.evaluateWithState(
					litExpr,
					extendedEnv,
					state,
				);
				return { value: litValue, env: extendedEnv };
			}

			// Handle ref expressions - get value from nodeValues or evaluate with extended env
			if (bodyNode.expr.kind === "ref") {
				const refExpr = bodyNode.expr;
				const refValue = nodeValues.get(refExpr.id);

				// If not in nodeValues, try to evaluate the referenced node with the extended environment
				// This handles ref to var nodes and other nodes that need the let-bound context
				if (!refValue) {
					const refNode = nodeMap.get(refExpr.id);
					if (refNode) {
						// Evaluate with the extended environment (which includes let bindings)
						const refResult = evalNode(
							evaluator,
							refNode,
							nodeMap,
							nodeValues,
							extendedEnv,
							options,
						);
							// Return the extendedEnv to preserve the let binding
							// refResult.env may have additional bindings from nested lets
						return { value: refResult.value, env: extendedEnv };
					}
					return {
						value: errorVal(
							ErrorCodes.DomainError,
							"Referenced node not found: " + refExpr.id,
						),
						env: extendedEnv,
					};
				}
				return { value: refValue, env: extendedEnv };
			}

			// For bound nodes (let/if/lambda bodies), use evalNode with extended environment
			// For other expressions, evaluate with the extended environment
			const bodyResult = evalNode(
				evaluator,
				bodyNode,
				nodeMap,
				nodeValues,
				extendedEnv,
				options,
			);
			return { value: bodyResult.value, env: bodyResult.env };
		} else {
			// Inline expression - evaluate it directly
			const bodyValue = evaluator.evaluateWithState(expr.body, extendedEnv, state);
			return { value: bodyValue, env: extendedEnv };
		}
	}

	case "airRef": {
		// Get the airDef
		const def = lookupDef(evaluator.defs, expr.ns, expr.name);
		if (!def) {
			return {
				value: errorVal(
					ErrorCodes.UnknownDefinition,
					"Unknown definition: " + expr.ns + ":" + expr.name,
				),
				env,
			};
		}

		// Check arity
		if (def.params.length !== expr.args.length) {
			return {
				value: errorVal(
					ErrorCodes.ArityError,
					"Arity error for airDef: " + expr.ns + ":" + expr.name,
				),
				env,
			};
		}

		// Get argument values
		const argValues: Value[] = [];
		for (const argId of expr.args) {
			const argValue = nodeValues.get(argId);
			if (!argValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Argument node not evaluated: " + argId,
					),
					env,
				};
			}
			if (isError(argValue)) {
				return { value: argValue, env };
			}
			argValues.push(argValue);
		}

		// Create environment with argument bindings
		let defEnv = emptyValueEnv();
		for (let i = 0; i < def.params.length; i++) {
			const param = def.params[i];
			const argValue = argValues[i];
			if (param === undefined) {
				return {
					value: errorVal(
						ErrorCodes.ValidationError,
						`Parameter at index ${i} is undefined`,
					),
					env,
				};
			}
			if (argValue === undefined) {
				return {
					value: errorVal(
						ErrorCodes.ValidationError,
						`Argument value at index ${i} is undefined`,
					),
					env,
				};
			}
			defEnv = extendValueEnv(defEnv, param, argValue);
		}

		// Evaluate the def body
		// If the body is a call expression, handle it specially (similar to callExpr)
		if (def.body.kind === "call") {
			const callExpr = def.body;
			if ("ns" in callExpr && "name" in callExpr && "args" in callExpr) {
				// Get argument values from the def environment (for parameters) or nodeValues (for node refs)
				const callArgValues: Value[] = [];
				for (const argId of callExpr.args) {
					let argValue = lookupValue(defEnv, argId);
					argValue ??= nodeValues.get(argId);
					if (!argValue) {
						return {
							value: errorVal(
								ErrorCodes.DomainError,
								"Argument not found: " + argId,
							),
							env,
						};
					}
					if (isError(argValue)) {
						return { value: argValue, env };
					}
					callArgValues.push(argValue);
				}

				// Look up and apply the operator
				const op = lookupOperator(evaluator.registry, callExpr.ns, callExpr.name);
				if (!op) {
					return {
						value: errorVal(
							ErrorCodes.UnknownOperator,
							"Unknown operator: " + callExpr.ns + ":" + callExpr.name,
						),
						env,
					};
				}

				if (op.params.length !== callArgValues.length) {
					return {
						value: errorVal(
							ErrorCodes.ArityError,
							"Arity error: " + callExpr.ns + ":" + callExpr.name,
						),
						env,
					};
				}

				try {
					const value = op.fn(...callArgValues);
					return { value, env };
				} catch (e) {
					if (e instanceof SPIRALError) {
						return { value: e.toValue(), env };
					}
					return { value: errorVal(ErrorCodes.DomainError, String(e)), env };
				}
			}
		}

		// For other expression types, use the standard evalExpr path
		const defEvaluator = new Evaluator(
			evaluator.registry,
			evaluator.defs,
		);
		const value = defEvaluator.evaluateWithState(def.body, defEnv, {
			steps: 0,
			maxSteps: state.maxSteps,
			trace: state.trace,
		});
		return { value, env };
	}

	case "predicate": {
		const valueNodeValue = nodeValues.get(expr.value);
		if (!valueNodeValue) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Value node not evaluated: " + expr.value,
				),
				env,
			};
		}
		// Predicates create a tagged value - for now, just return bool
		return { value: boolVal(true), env };
	}

	case "lambda": {
		// Get the body expression
		const bodyNode = nodeMap.get(expr.body);
		if (!bodyNode) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Body node not found: " + expr.body,
				),
				env,
			};
		}
		// Create a closure
		if (isBlockNode(bodyNode)) {
			// Block nodes as lambda bodies are not currently supported
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Block nodes as lambda bodies are not supported",
				),
				env,
			};
		}
		// Convert params to LambdaParam format
		const lambdaParams: import("./types.js").LambdaParam[] = expr.params.map(p =>
			typeof p === "string" ? { name: p } : p
		);
		const value = closureVal(lambdaParams, bodyNode.expr, env);
		return { value, env };
	}

	case "callExpr": {
		// Look up function: first in nodeValues, then in environment (for lambda params)
		let fnValue = nodeValues.get(expr.fn);
		fnValue ??= lookupValue(env, expr.fn);
		if (!fnValue) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Function node not evaluated: " + expr.fn,
				),
				env,
			};
		}
		if (isError(fnValue)) {
			return { value: fnValue, env };
		}
		if (fnValue.kind !== "closure") {
			return {
				value: errorVal(
					ErrorCodes.TypeError,
					"Expected closure, got: " + fnValue.kind,
				),
				env,
			};
		}

		// Get argument values
		const argValues: Value[] = [];
		for (const argId of expr.args) {
			// Look up in nodeValues first, then in environment (for lambda params)
			let argValue = nodeValues.get(argId);
			argValue ??= lookupValue(env, argId);
			if (!argValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Argument node not evaluated: " + argId,
					),
					env,
				};
			}
			if (isError(argValue)) {
				return { value: argValue, env };
			}
			argValues.push(argValue);
		}

		// Check arity - support partial application (currying)
		if (argValues.length > fnValue.params.length) {
			return {
				value: errorVal(ErrorCodes.ArityError, "Arity error in callExpr: too many arguments"),
				env,
			};
		}

		// Handle partial application (currying) with optional parameter support
		// Calculate min arity
		let minArity = 0;
		for (const param of fnValue.params) {
			if (!param.optional) {
				minArity++;
			}
		}

		// Only do partial application if we have FEWER args than required (min arity)
		// If we have at least min arity, we should fill in defaults and do full application
		if (argValues.length < minArity) {
			return {
				value: errorVal(
					ErrorCodes.ArityError,
					`Arity error: expected at least ${minArity} args, got ${argValues.length}`,
				),
				env,
			};
		}

		// We have at least the min arity - do full application with defaults for omitted optional params
		let callEnv = fnValue.env;
		for (let i = 0; i < fnValue.params.length; i++) {
			const param = fnValue.params[i];
			if (param === undefined) {
				return {
					value: errorVal(
						ErrorCodes.ValidationError,
						`Parameter at index ${i} is undefined`,
					),
					env,
				};
			}
			const argValue = argValues[i];

			if (argValue !== undefined) {
				// Provided argument - use it
				callEnv = extendValueEnv(callEnv, param.name, argValue);
			} else if (param.optional) {
				// Omitted optional param - use default or undefined
				if (param.default !== undefined) {
					// Evaluate default expression in closure's defining environment
					const defaultVal = evalExprWithNodeMap(
						evaluator.registry,
						evaluator.defs,
						param.default,
						nodeMap,
						nodeValues,
						fnValue.env,
						options,
					);
					if (isError(defaultVal)) {
						return { value: defaultVal, env };
					}
					callEnv = extendValueEnv(callEnv, param.name, defaultVal);
				} else {
					// Optional without default = undefined
					callEnv = extendValueEnv(callEnv, param.name, undefinedVal());
				}
			}
			// else: required param not provided - should have been caught by arity check above
		}

		// Evaluate the body
		// If the body is a call expression, we need to handle it specially
		// because evalCall throws an error at the expression level
		if (fnValue.body.kind === "call") {
			const callExpr = fnValue.body as {
					kind: "call";
					ns: string;
					name: string;
					args: string[];
				};
				// Get argument values from the call environment or nodeValues
			const callArgValues: Value[] = [];
			for (const argId of callExpr.args) {
				// First try the call environment (for lambda parameters)
				let argValue = lookupValue(callEnv, argId);
				// If not found, try nodeValues (for node references)
				argValue ??= nodeValues.get(argId);
				if (!argValue) {
					return {
						value: errorVal(
							ErrorCodes.DomainError,
							"Argument not found: " + argId,
						),
						env,
					};
				}
				if (isError(argValue)) {
					return { value: argValue, env };
				}
				callArgValues.push(argValue);
			}

			const op = lookupOperator(
				evaluator.registry,
				callExpr.ns,
				callExpr.name,
			);
			if (!op) {
				return {
					value: errorVal(
						ErrorCodes.UnknownOperator,
						"Unknown operator: " + callExpr.ns + ":" + callExpr.name,
					),
					env,
				};
			}

			if (op.params.length !== callArgValues.length) {
				return {
					value: errorVal(
						ErrorCodes.ArityError,
						"Arity error: " + callExpr.ns + ":" + callExpr.name,
					),
					env,
				};
			}

			try {
				const value = op.fn(...callArgValues);
				return { value, env };
			} catch (e) {
				if (e instanceof SPIRALError) {
					return { value: e.toValue(), env };
				}
				return { value: errorVal(ErrorCodes.DomainError, String(e)), env };
			}
		}

		// Evaluate the closure body with access to nodeMap for resolution
		const bodyResult = evalExprWithNodeMap(
			evaluator.registry,
			evaluator.defs,
			fnValue.body,
			nodeMap,
			nodeValues,
			callEnv,
			options,
		);
		return { value: bodyResult, env };
	}

	case "fix": {
		const fnValue = nodeValues.get(expr.fn);
		if (!fnValue) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Function node not evaluated: " + expr.fn,
				),
				env,
			};
		}
		if (isError(fnValue)) {
			return { value: fnValue, env };
		}
		if (fnValue.kind !== "closure") {
			return {
				value: errorVal(
					ErrorCodes.TypeError,
					"Expected closure, got: " + fnValue.kind,
				),
				env,
			};
		}

		// Fix requires a single-parameter closure
		if (fnValue.params.length !== 1) {
			return {
				value: errorVal(
					ErrorCodes.ArityError,
					"Fix requires single-parameter function",
				),
				env,
			};
		}

		// Create the fixed point by unrolling: fix(f) = f(fix(f))
		// For factorial: fix(λrec.λn.body) = (λrec.λn.body)(fix(λrec.λn.body))
		// The result is λn.body with rec bound to the fixed point
		const firstParam = fnValue.params[0];
		if (firstParam === undefined) {
			return {
				value: errorVal(
					ErrorCodes.ArityError,
					"fix requires a function with at least one parameter",
				),
				env,
			};
		}
		const param = firstParam.name;

		// Create a placeholder for the fixed point (will be replaced)
		// We need to create a self-referential closure
		// The trick is to evaluate the body of fnValue with rec bound to a special value
		// that, when called, performs the recursive application

		// First, evaluate the body of fnValue to get the inner lambda
		// with rec bound to a self-referential thunk
		const selfRef: ClosureVal = {
			kind: "closure",
			params: [], // placeholder
			body: fnValue.body, // placeholder
			env: fnValue.env, // placeholder
		};

		// Create the fixed-point environment where rec refers to selfRef
		const fixEnv = extendValueEnv(fnValue.env, param, selfRef);

		// Evaluate the body of fnValue to get the result
		// This should give us λn.body with rec bound
		const innerResult = evalExprWithNodeMap(
			evaluator.registry,
			evaluator.defs,
			fnValue.body,
			nodeMap,
			nodeValues,
			fixEnv,
			options,
		);

		if (isError(innerResult)) {
			return { value: innerResult, env };
		}

		if (innerResult.kind !== "closure") {
			return {
				value: errorVal(
					ErrorCodes.TypeError,
					"Fix body should evaluate to closure, got: " + innerResult.kind,
				),
				env,
			};
		}

		// Update selfRef to be the actual fixed point closure
		// The fixed point is the inner result, but with rec in its environment
		// pointing back to itself
		selfRef.params = innerResult.params;
		selfRef.body = innerResult.body;
		selfRef.env = extendValueEnv(innerResult.env, param, selfRef);

		return { value: selfRef, env };
	}

	// PIR expressions - not supported in synchronous evaluator
	case "par":
	case "spawn":
	case "await":
	case "channel":
	case "send":
	case "recv":
	case "select":
	case "race":
		return {
			value: errorVal(
				ErrorCodes.DomainError,
				"PIR expressions require AsyncEvaluator: " + expr.kind,
			),
			env,
		};

	default:
		return { value: exhaustive(expr), env };
	}
}

//==============================================================================
// EIR Expression Kinds (for detection)
//==============================================================================

const EIR_EXPRESSION_KINDS = [
	"seq",
	"assign",
	"while",
	"for",
	"iter",
	"effect",
	"refCell",
	"deref",
	"try",
] as const;

//==============================================================================
// EIR Program Evaluation
//==============================================================================

/**
 * EIR evaluation options with effect registry
 */
export interface EIROptions extends EvalOptions {
	effects?: EffectRegistry;
}

/**
 * Evaluate an EIR program with mutable state and effects.
 *
 * E-Seq:   ρ ⊢ first ⇓ v1, ρ ⊢ then ⇓ v ⇒ ρ ⊢ seq(first, then) ⇓ v
 * E-Assign: ρ ⊢ value ⇓ v, ρ[target↦v] ⊢ · ⇒ ρ ⊢ assign(target, value) ⇓ void
 * E-WhileTrue: ρ ⊢ cond ⇓ true, ρ ⊢ body ⇓ _, ρ' ⊢ while(cond, body) ⇓ v
 * E-WhileFalse: ρ ⊢ cond ⇓ false ⇒ ρ ⊢ while(cond, body) ⇓ void
 * E-For: C-style for loop with init, cond, update, body
 * E-Iter: Iterate over list/set elements
 * E-Effect: Execute side effect operation
 * E-RefCell: Create or read mutable reference cell
 * E-Deref: Read from mutable reference cell
 */
export function evaluateEIR(
	doc: EIRDocument,
	registry: OperatorRegistry,
	defs: Defs,
	inputs?: Map<string, Value>,
	options?: EIROptions,
): { result: Value; state: EvalState } {
	const effectRegistry = options?.effects ?? emptyEffectRegistry();

	// Initialize EIR evaluation state
	const state: EvalState = createEvalState(inputs);
	if (options?.maxSteps) {
		state.maxSteps = options.maxSteps;
	}

	const evaluator = new Evaluator(registry, defs);
	const nodeMap = new Map<string, EirHybridNode>();
	const nodeValues = new Map<string, Value>();

	// Build node map
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	// Evaluate each node in order
	for (const node of doc.nodes) {
		const result = evalEIRNode(
			evaluator,
			node,
			nodeMap,
			nodeValues,
			state,
			registry,
			effectRegistry,
			defs,
			options,
		);
		nodeValues.set(node.id, result.value);

		// Update state environment from node result
		state.env = result.env;

		// Don't return early on errors - let try/catch expressions handle them
		// Continue evaluating all nodes so that try expressions can catch errors
	}

	// Get the result node's value
	const resultValue = nodeValues.get(doc.result);
	if (!resultValue) {
		const resultNode = nodeMap.get(doc.result);
		if (resultNode) {
			const result = evalEIRNode(
				evaluator,
				resultNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);
			return { result: result.value, state };
		}
		return {
			result: errorVal(
				ErrorCodes.DomainError,
				"Result node not evaluated: " + doc.result,
			),
			state,
		};
	}

	return { result: resultValue, state };
}

interface EIRNodeEvalResult {
	value: Value;
	env: ValueEnv;
	refCells?: Map<string, Value>;
}

/**
 * Evaluate a single node in EIR context.
 * Handles both CIR expressions and EIR-specific expressions.
 */
function evalEIRNode(
	evaluator: Evaluator,
	node: EirHybridNode,
	nodeMap: Map<string, EirHybridNode>,
	nodeValues: Map<string, Value>,
	state: EvalState,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
	defs: Defs,
	options?: EIROptions,
): EIRNodeEvalResult {
	state.steps++;
	if (state.steps > state.maxSteps) {
		return {
			value: errorVal(ErrorCodes.NonTermination, "Evaluation exceeded maximum steps"),
			env: state.env,
			refCells: state.refCells,
		};
	}

	// Handle block nodes
	if (isBlockNode(node)) {
		// For EIR block nodes, we need to convert to AIR map and evaluate
		const airNodeMap = nodeMap as unknown as Map<string, AirHybridNode>;
		const result = evaluateBlockNode(node, registry, airNodeMap, nodeValues, state.env, options);
		return {
			value: result,
			env: state.env,
			refCells: state.refCells,
		};
	}

	const expr = node.expr;

	// Check for EIR-specific expressions
	const kind = expr.kind as string;
	if (EIR_EXPRESSION_KINDS.includes(kind as (typeof EIR_EXPRESSION_KINDS)[number])) {
		return evalEIRExpr(
			expr,
			nodeMap,
			nodeValues,
			state,
			registry,
			effectRegistry,
			defs,
			options,
		);
	}

	// For CIR expressions, delegate to existing evalNode
	// We need to wrap it to return the correct type
	// The kind check above ensures expr is actually a CIR Expr, not EIR-specific
	const cirResult = evalNode(
		evaluator,
		node as Node,
		nodeMap as Map<string, Node>,
		nodeValues,
		state.env,
		options,
	);

	return {
		value: cirResult.value,
		env: cirResult.env,
		refCells: state.refCells,
	};
}

/**
 * Evaluate EIR-specific expressions.
 */
function evalEIRExpr(
	expr: EirExpr,
	nodeMap: Map<string, EirHybridNode>,
	nodeValues: Map<string, Value>,
	state: EvalState,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
	defs: Defs,
	options?: EIROptions,
): EIRNodeEvalResult {
	const kind = expr.kind as string;

	switch (kind) {
	case "seq": {
		const e = expr as unknown as { first: string; then: string };
		// E-Seq: Evaluate first, then then, return result of then
		const firstNode = nodeMap.get(e.first);
		if (!firstNode) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"First node not found: " + e.first,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		const firstResult = evalEIRNode(
			new Evaluator(registry, defs),
			firstNode,
			nodeMap,
			nodeValues,
			state,
			registry,
			effectRegistry,
			defs,
			options,
		);

		if (isError(firstResult.value)) {
			return { value: firstResult.value, env: state.env, refCells: state.refCells };
		}

		// Update state from first evaluation
		if (firstResult.refCells) {
			state.refCells = firstResult.refCells;
		}

		const thenNode = nodeMap.get(e.then);
		if (!thenNode) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Then node not found: " + e.then,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		const thenResult = evalEIRNode(
			new Evaluator(registry, defs),
			thenNode,
			nodeMap,
			nodeValues,
			state,
			registry,
			effectRegistry,
			defs,
			options,
		);

		if (thenResult.refCells) {
			state.refCells = thenResult.refCells;
		}

		return {
			value: thenResult.value,
			env: thenResult.env,
			refCells: state.refCells,
		};
	}

	case "assign": {
		const e = expr as unknown as { target: string; value: string };
		// E-Assign: Evaluate value and store in environment
		const valueNode = nodeMap.get(e.value);
		if (!valueNode) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Value node not found: " + e.value,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		// Clear the cached value of the value node to force re-evaluation
		// This is important for loops where the value node references variables that change
		nodeValues.delete(e.value);

		const valueResult = evalEIRNode(
			new Evaluator(registry, defs),
			valueNode,
			nodeMap,
			nodeValues,
			state,
			registry,
			effectRegistry,
			defs,
			options,
		);

		if (isError(valueResult.value)) {
			return { value: valueResult.value, env: state.env, refCells: state.refCells };
		}

		// Store the result in nodeValues for future reference
		nodeValues.set(e.value, valueResult.value);

		// Extend environment with the binding
		const newEnv = extendValueEnv(state.env, e.target, valueResult.value);
		state.env = newEnv;

		return {
			value: voidVal(),
			env: newEnv,
			refCells: state.refCells,
		};
	}

	case "while": {
		const e = expr as unknown as { cond: string; body: string };
		// E-While: Loop while condition is true
		let loopResult: Value = voidVal();

		for (;;) {
			state.steps++;
			if (state.steps > state.maxSteps) {
				return {
					value: errorVal(ErrorCodes.NonTermination, "While loop exceeded maximum steps"),
					env: state.env,
					refCells: state.refCells,
				};
			}

			// Evaluate condition
			const condNode = nodeMap.get(e.cond);
			if (!condNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Condition node not found: " + e.cond,
					),
					env: state.env,
					refCells: state.refCells,
				};
			}

			// Clear condition node cache to force re-evaluation
			nodeValues.delete(e.cond);

			const condResult = evalEIRNode(
				new Evaluator(registry, defs),
				condNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);

			if (isError(condResult.value)) {
				return { value: condResult.value, env: state.env, refCells: state.refCells };
			}

			// Check if condition is false - exit loop
			if (condResult.value.kind !== "bool" || !condResult.value.value) {
				break;
			}

			// Evaluate body
			const bodyNode = nodeMap.get(e.body);
			if (!bodyNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Body node not found: " + e.body,
					),
					env: state.env,
					refCells: state.refCells,
				};
			}

			const bodyResult = evalEIRNode(
				new Evaluator(registry, defs),
				bodyNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);

			if (isError(bodyResult.value)) {
				return { value: bodyResult.value, env: state.env, refCells: state.refCells };
			}

			loopResult = bodyResult.value;
			if (bodyResult.refCells) {
				state.refCells = bodyResult.refCells;
			}
			if (bodyResult.env !== state.env) {
				state.env = bodyResult.env;
			}
		}

		return {
			value: loopResult,
			env: state.env,
			refCells: state.refCells,
		};
	}

	case "for": {
		const e = expr as unknown as {
				var: string;
				init: string;
				cond: string;
				update: string;
				body: string;
			};
			// E-For: C-style for loop
			// 1. Evaluate init
		const initNode = nodeMap.get(e.init);
		if (!initNode) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Init node not found: " + e.init,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		const initResult = evalEIRNode(
			new Evaluator(registry, defs),
			initNode,
			nodeMap,
			nodeValues,
			state,
			registry,
			effectRegistry,
			defs,
			options,
		);

		if (isError(initResult.value)) {
			return { value: initResult.value, env: state.env, refCells: state.refCells };
		}

		// Bind loop variable
		let loopEnv = extendValueEnv(state.env, e.var, initResult.value);
		let loopResult: Value = voidVal();

		for (;;) {
			state.steps++;
			if (state.steps > state.maxSteps) {
				return {
					value: errorVal(ErrorCodes.NonTermination, "For loop exceeded maximum steps"),
					env: state.env,
					refCells: state.refCells,
				};
			}

			// 2. Evaluate condition
			const condNode = nodeMap.get(e.cond);
			if (!condNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Condition node not found: " + e.cond,
					),
					env: loopEnv,
					refCells: state.refCells,
				};
			}

			// Temporarily set environment for condition evaluation
			const originalEnv = state.env;
			state.env = loopEnv;

			const condResult = evalEIRNode(
				new Evaluator(registry, defs),
				condNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);

			state.env = originalEnv;

			if (isError(condResult.value)) {
				return { value: condResult.value, env: loopEnv, refCells: state.refCells };
			}

			// Check if condition is false - exit loop
			if (condResult.value.kind !== "bool" || !condResult.value.value) {
				break;
			}

			// 3. Evaluate body
			const bodyNode = nodeMap.get(e.body);
			if (!bodyNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Body node not found: " + e.body,
					),
					env: loopEnv,
					refCells: state.refCells,
				};
			}

			state.env = loopEnv;
			const bodyResult = evalEIRNode(
				new Evaluator(registry, defs),
				bodyNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);

			if (isError(bodyResult.value)) {
				return { value: bodyResult.value, env: loopEnv, refCells: state.refCells };
			}

			loopResult = bodyResult.value;
			if (bodyResult.refCells) {
				state.refCells = bodyResult.refCells;
			}

			// 4. Evaluate update
			const updateNode = nodeMap.get(e.update);
			if (!updateNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Update node not found: " + e.update,
					),
					env: loopEnv,
					refCells: state.refCells,
				};
			}

			const updateResult = evalEIRNode(
				new Evaluator(registry, defs),
				updateNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);

			if (isError(updateResult.value)) {
				return { value: updateResult.value, env: loopEnv, refCells: state.refCells };
			}

			// Update loop variable
			loopEnv = extendValueEnv(loopEnv, e.var, updateResult.value);
			state.env = originalEnv;
		}

		return {
			value: loopResult,
			env: loopEnv,
			refCells: state.refCells,
		};
	}

	case "iter": {
		const e = expr as unknown as { var: string; iter: string; body: string };
		// E-Iter: Iterate over list/set elements
		const iterNode = nodeMap.get(e.iter);
		if (!iterNode) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Iter node not found: " + e.iter,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		const iterResult = evalEIRNode(
			new Evaluator(registry, defs),
			iterNode,
			nodeMap,
			nodeValues,
			state,
			registry,
			effectRegistry,
			defs,
			options,
		);

		if (isError(iterResult.value)) {
			return { value: iterResult.value, env: state.env, refCells: state.refCells };
		}

		// Get elements from list or set
		let elements: Value[] = [];
		if (iterResult.value.kind === "list") {
			elements = iterResult.value.value;
		} else if (iterResult.value.kind === "set") {
			// Set value contains stringified hashes - convert back to values
			// Hash format: "i:123" for int, "b:true" for bool, "f:3.14" for float, "s:hello" for string
			elements = Array.from(iterResult.value.value).map((hash) => {
				const colonIndex = hash.indexOf(":");
				if (colonIndex === -1) {
					return errorVal(ErrorCodes.TypeError, "Invalid hash format: " + hash);
				}
				const typePrefix = hash.slice(0, colonIndex);
				const valueStr = hash.slice(colonIndex + 1);

				switch (typePrefix) {
				case "i":
					return intVal(Number.parseInt(valueStr, 10));
				case "b":
					return { kind: "bool", value: valueStr === "true" };
				case "f":
					return { kind: "float", value: Number.parseFloat(valueStr) };
				case "s":
					return { kind: "string", value: valueStr };
				default:
					return errorVal(ErrorCodes.TypeError, "Unknown hash type: " + typePrefix);
				}
			});
		} else {
			return {
				value: errorVal(
					ErrorCodes.TypeError,
					"Iter requires list or set, got: " + iterResult.value.kind,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		let iterEnv = state.env;
		for (const elem of elements) {
			state.steps++;
			if (state.steps > state.maxSteps) {
				return {
					value: errorVal(ErrorCodes.NonTermination, "Iter loop exceeded maximum steps"),
					env: state.env,
					refCells: state.refCells,
				};
			}

			// Bind loop variable to element by extending the environment
			const loopEnv = extendValueEnv(iterEnv, e.var, elem);

			// Evaluate body
			const bodyNode = nodeMap.get(e.body);
			if (!bodyNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Body node not found: " + e.body,
					),
					env: iterEnv,
					refCells: state.refCells,
				};
			}

			const originalEnv = state.env;
			state.env = loopEnv;

			const bodyResult = evalEIRNode(
				new Evaluator(registry, defs),
				bodyNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);

			state.env = originalEnv;

			if (isError(bodyResult.value)) {
				return { value: bodyResult.value, env: iterEnv, refCells: state.refCells };
			}

			// Update iterEnv with the result environment (for assign expressions)
			iterEnv = bodyResult.env;

			if (bodyResult.refCells) {
				state.refCells = bodyResult.refCells;
			}
		}

		return {
			value: voidVal(),
			env: iterEnv,
			refCells: state.refCells,
		};
	}

	case "effect": {
		const e = expr as unknown as { op: string; args: string[] };
		// E-Effect: Execute side effect operation
		const effectOp = lookupEffect(effectRegistry, e.op);
		if (!effectOp) {
			return {
				value: errorVal(
					ErrorCodes.UnknownOperator,
					"Unknown effect operation: " + e.op,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		// Evaluate arguments
		const argValues: Value[] = [];
		for (const argId of e.args) {
			const argNode = nodeMap.get(argId);
			if (!argNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Argument node not found: " + argId,
					),
					env: state.env,
					refCells: state.refCells,
				};
			}

			const argResult = evalEIRNode(
				new Evaluator(registry, defs),
				argNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);

			if (isError(argResult.value)) {
				return { value: argResult.value, env: state.env, refCells: state.refCells };
			}

			argValues.push(argResult.value);
		}

		// Check arity
		if (effectOp.params.length !== argValues.length) {
			return {
				value: errorVal(
					ErrorCodes.ArityError,
					`Effect ${e.op} expects ${effectOp.params.length} args, got ${argValues.length}`,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		// Record effect
		state.effects.push({ op: e.op, args: argValues });

		// Execute effect operation
		try {
			const result = effectOp.fn(...argValues);
			return {
				value: result,
				env: state.env,
				refCells: state.refCells,
			};
		} catch (err) {
			if (err instanceof SPIRALError) {
				return { value: err.toValue(), env: state.env, refCells: state.refCells };
			}
			return {
				value: errorVal(ErrorCodes.DomainError, String(err)),
				env: state.env,
				refCells: state.refCells,
			};
		}
	}

	case "try": {
		const e = expr as unknown as {
			tryBody: string;
			catchParam: string;
			catchBody: string;
			fallback?: string;
		};

		// Check if tryBody was already evaluated and has a value (or error) in nodeValues
		const tryNode = nodeMap.get(e.tryBody);
		if (!tryNode) {
			return {
				value: errorVal(ErrorCodes.ValidationError, "Try body node not found: " + e.tryBody),
				env: state.env,
				refCells: state.refCells,
			};
		}

		// Try to get pre-evaluated value from nodeValues
		let tryValue = nodeValues.get(e.tryBody);
		let tryRefCells = state.refCells;

		// If not in nodeValues, evaluate it now
		if (tryValue === undefined) {
			const tryResult = evalEIRNode(
				new Evaluator(registry, defs),
				tryNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);
			tryValue = tryResult.value;
			tryRefCells = tryResult.refCells ?? state.refCells;
			// Store the result for future reference
			nodeValues.set(e.tryBody, tryValue);
		}

		// Check if error occurred
		if (isError(tryValue)) {
			// ERROR PATH - bind error to catchParam and evaluate catchBody
			const catchEnv = extendValueEnv(state.env, e.catchParam, tryValue);
			const catchState: EvalState = {
				...state,
				env: catchEnv,
				refCells: tryRefCells,
			};

			const catchNode = nodeMap.get(e.catchBody);
			if (!catchNode) {
				return {
					value: errorVal(ErrorCodes.ValidationError, "Catch body node not found: " + e.catchBody),
					env: state.env,
					refCells: state.refCells,
				};
			}

			return evalEIRNode(
				new Evaluator(registry, defs),
				catchNode,
				nodeMap,
				nodeValues,
				catchState,
				registry,
				effectRegistry,
				defs,
				options,
			);
		}

		// SUCCESS PATH
		if (e.fallback) {
			// Has fallback - evaluate it
			const fallbackNode = nodeMap.get(e.fallback);
			if (!fallbackNode) {
				return {
					value: errorVal(ErrorCodes.ValidationError, "Fallback node not found: " + e.fallback),
					env: state.env,
					refCells: state.refCells,
				};
			}

			// Update state from try evaluation
			state.refCells = tryRefCells;

			return evalEIRNode(
				new Evaluator(registry, defs),
				fallbackNode,
				nodeMap,
				nodeValues,
				state,
				registry,
				effectRegistry,
				defs,
				options,
			);
		}

		// No fallback - return tryBody result
		return { value: tryValue, env: state.env, refCells: tryRefCells };
	}

	case "refCell": {
		const e = expr as unknown as { target: string };
		// E-RefCell: Create a new reference cell
		// Check if target is already in environment
		const existingValue = lookupValue(state.env, e.target);
		if (existingValue) {
			// Create a new ref cell with the existing value
			const cellId = e.target + "_ref";
			state.refCells.set(cellId, existingValue);
			return {
				value: refCellVal(existingValue),
				env: state.env,
				refCells: state.refCells,
			};
		}

		return {
			value: errorVal(
				ErrorCodes.UnboundIdentifier,
				"Cannot create ref cell for unbound identifier: " + e.target,
			),
			env: state.env,
			refCells: state.refCells,
		};
	}

	case "deref": {
		const e = expr as unknown as { target: string };
		// E-Deref: Read from a reference cell
		const cellId = e.target + "_ref";
		const cellValue = state.refCells.get(cellId);
		if (cellValue === undefined) {
			return {
				value: errorVal(
					ErrorCodes.DomainError,
					"Reference cell not found: " + e.target,
				),
				env: state.env,
				refCells: state.refCells,
			};
		}

		return {
			value: cellValue,
			env: state.env,
			refCells: state.refCells,
		};
	}

	default:
		return {
			value: errorVal(
				ErrorCodes.ValidationError,
				"Unknown EIR expression kind: " + kind,
			),
			env: state.env,
			refCells: state.refCells,
		};
	}
}

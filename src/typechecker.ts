// CAIRS Type Checker
// Implements typing rules: Γ ⊢ e : τ

import { lookupOperator, type OperatorRegistry } from "./domains/registry.js";
import { TypeEnv, emptyTypeEnv, extendTypeEnv, lookupDef, lookupType, type Defs } from "./env.js";
import { CAIRSError, exhaustive } from "./errors.js";
import type { AIRDocument, Expr, Node, Type } from "./types.js";
import {
	boolType,
	fnType as fnTypeCtor,
	intType,
	listType,
	refType,
	typeEqual,
	voidType,
} from "./types.js";

//==============================================================================
// Type Checking Result
//==============================================================================

export type TypeCheckResult = {
	type: Type;
	env: TypeEnv;
};

//==============================================================================
// Type Checker
//==============================================================================

export class TypeChecker {
	private registry: OperatorRegistry;
	private defs: Defs;

	constructor(registry: OperatorRegistry, defs: Defs) {
		this.registry = registry;
		this.defs = defs;
	}

	/**
	 * Type check an expression: Γ ⊢ e : τ
	 */
	typeCheck(expr: Expr, env: TypeEnv): TypeCheckResult {
		switch (expr.kind) {
			case "lit":
				return this.typeCheckLit(expr, env);
			case "var":
				return this.typeCheckVar(expr, env);
			case "ref":
				return this.typeCheckRef(expr, env);
			case "call":
				return this.typeCheckCall(expr, env);
			case "if":
				return this.typeCheckIf(expr, env);
			case "let":
				return this.typeCheckLet(expr, env);
			case "airRef":
				return this.typeCheckAirRef(expr, env);
			case "predicate":
				return this.typeCheckPredicate(expr, env);
			case "lambda":
				return this.typeCheckLambda(expr, env);
			case "callExpr":
				return this.typeCheckCallExpr(expr, env);
			case "fix":
				return this.typeCheckFix(expr, env);
			default:
				throw CAIRSError.validation(
					"expression",
					"Unknown expression kind: " + (expr as { kind: string }).kind,
				);
		}
	}

	/**
	 * T-Lit: Γ ⊢ lit(t, v) : t
	 */
	private typeCheckLit(
		expr: { kind: "lit"; type: Type; value: unknown },
		env: TypeEnv,
	): TypeCheckResult {
		return { type: expr.type, env };
	}

	/**
	 * T-Var: Γ(x) = τ
	 *          -------
	 *          Γ ⊢ var(x) : τ
	 */
	private typeCheckVar(
		expr: { kind: "var"; name: string },
		env: TypeEnv,
	): TypeCheckResult {
		const type = lookupType(env, expr.name);
		if (!type) {
			throw CAIRSError.unboundIdentifier(expr.name);
		}
		return { type, env };
	}

	/**
	 * T-Ref: refs are type-checked by looking up the target node
	 *        The actual typing is done during program type checking
	 */
	private typeCheckRef(
		_expr: { kind: "ref"; id: string },
		_env: TypeEnv,
	): TypeCheckResult {
		// Refs are resolved during program type checking
		// This is a placeholder - actual type is determined by the target node
		throw new Error("Ref must be resolved during program type checking");
	}

	/**
	 * T-Call: find operator signature and check argument types
	 */
	private typeCheckCall(
		expr: { kind: "call"; ns: string; name: string; args: string[] },
		env: TypeEnv,
	): TypeCheckResult {
		const op = lookupOperator(this.registry, expr.ns, expr.name);
		if (!op) {
			throw CAIRSError.unknownOperator(expr.ns, expr.name);
		}

		// Check arity
		if (op.params.length !== expr.args.length) {
			throw CAIRSError.arityError(
				op.params.length,
				expr.args.length,
				expr.ns + ":" + expr.name,
			);
		}

		// Arguments are node refs, their types are checked during program type checking
		// For now, just return the operator's return type
		return { type: op.returns, env };
	}

	/**
	 * T-If: Γ ⊢ cond : bool    Γ ⊢ then : τ    Γ ⊢ else : τ
	 *       ---------------------------------------------
	 *                    Γ ⊢ if(cond, then, else) : τ
	 */
	private typeCheckIf(
		expr: { kind: "if"; cond: string; then: string; else: string; type: Type },
		env: TypeEnv,
	): TypeCheckResult {
		// Branch types are checked during program type checking
		return { type: expr.type, env };
	}

	/**
	 * T-Let: Γ ⊢ value : τ1    Γ, x:τ1 ⊢ body : τ2
	 *        -------------------------------------
	 *              Γ ⊢ let(x, value, body) : τ2
	 */
	private typeCheckLet(
		_expr: { kind: "let"; name: string; value: string; body: string },
		env: TypeEnv,
	): TypeCheckResult {
		// Value and body types are checked during program type checking
		// This is a placeholder - actual typing is done by the program checker
		return { type: { kind: "int" } as Type, env };
	}

	/**
	 * T-AirRef: look up airDef signature and check argument types
	 */
	private typeCheckAirRef(
		expr: { kind: "airRef"; ns: string; name: string; args: string[] },
		env: TypeEnv,
	): TypeCheckResult {
		const def = lookupDef(this.defs, expr.ns, expr.name);
		if (!def) {
			throw CAIRSError.unknownDefinition(expr.ns, expr.name);
		}

		// Check arity
		if (def.params.length !== expr.args.length) {
			throw CAIRSError.arityError(
				def.params.length,
				expr.args.length,
				expr.ns + ":" + expr.name,
			);
		}

		// Arguments are node refs, their types are checked during program type checking
		return { type: def.result, env };
	}

	/**
	 * T-Pred: predicates always produce bool type
	 */
	private typeCheckPredicate(
		_expr: { kind: "predicate"; name: string; value: string },
		env: TypeEnv,
	): TypeCheckResult {
		// Predicates return bool
		return { type: boolType, env };
	}

	/**
	 * T-Λ (Lambda): Γ, x1:τ1, ..., xn:τn ⊢ body : τ_return
	 *               ----------------------------------------
	 *           Γ ⊢ lambda([x1,...,xn], body) : fn(τ1,...,τn) -> τ_return
	 */
	private typeCheckLambda(
		expr: { kind: "lambda"; params: string[]; body: string; type: Type },
		env: TypeEnv,
	): TypeCheckResult {
		// Lambda type should be a FnType
		if (expr.type.kind !== "fn") {
			throw CAIRSError.typeError(fnTypeCtor([], intType), expr.type, "lambda");
		}
		return { type: expr.type, env };
	}

	/**
	 * T-CallExpr: Γ ⊢ fn : fn(τ1,...,τn) -> τ    Γ ⊢ args[i] : τi
	 *             --------------------------------------------------
	 *                     Γ ⊢ callExpr(fn, args) : τ
	 */
	private typeCheckCallExpr(
		_expr: { kind: "callExpr"; fn: string; args: string[] },
		env: TypeEnv,
	): TypeCheckResult {
		// Fn and arg types are checked during program type checking
		return { type: { kind: "int" } as Type, env };
	}

	/**
	 * T-Fix: Γ ⊢ fn : fn(τ) -> τ
	 *        -----------------
	 *        Γ ⊢ fix(fn) : τ
	 */
	private typeCheckFix(
		expr: { kind: "fix"; fn: string; type: Type },
		env: TypeEnv,
	): TypeCheckResult {
		// Fix requires the function type to be of the form fn(τ) -> τ
		// This is checked during program type checking
		return { type: expr.type, env };
	}
}

//==============================================================================
// Program Type Checking
//==============================================================================

/**
 * Type check a full AIR/CIR program.
 * Resolves all node references and ensures type consistency.
 */
export function typeCheckProgram(
	doc: AIRDocument,
	registry: OperatorRegistry,
	defs: Defs,
): { nodeTypes: Map<string, Type>; resultType: Type } {
	const checker = new TypeChecker(registry, defs);
	const nodeTypes = new Map<string, Type>();
	const nodeEnvs = new Map<string, TypeEnv>();

	// Build a map of nodes for easy lookup
	const nodeMap = new Map<string, Node>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	// Type check each node in order (ensuring refs point to earlier nodes)
	for (const node of doc.nodes) {
		let env = emptyTypeEnv();

		// Type check the expression
		const result = typeCheckNode(
			checker,
			node,
			nodeMap,
			nodeTypes,
			nodeEnvs,
			env,
		);
		nodeTypes.set(node.id, result.type);
		nodeEnvs.set(node.id, result.env);
	}

	// Get the result type
	const resultType = nodeTypes.get(doc.result);
	if (!resultType) {
		throw CAIRSError.validation(
			"result",
			"Result node not found: " + doc.result,
		);
	}

	return { nodeTypes, resultType };
}

/**
 * Type check a single node, resolving references.
 */
function typeCheckNode(
	checker: TypeChecker,
	node: Node,
	nodeMap: Map<string, Node>,
	nodeTypes: Map<string, Type>,
	_nodeEnvs: Map<string, TypeEnv>,
	env: TypeEnv,
): TypeCheckResult {
	const expr = node.expr;

	switch (expr.kind) {
		case "lit": {
			return checker.typeCheck(expr, env);
		}

		case "var": {
			return checker.typeCheck(expr, env);
		}

		case "ref": {
			// Look up the referenced node's type
			const targetType = nodeTypes.get(expr.id);
			if (!targetType) {
				throw CAIRSError.validation(
					"ref",
					"Referenced node not found: " + expr.id,
				);
			}
			return { type: targetType, env };
		}

		case "call": {
			// Check arguments exist and get their types
			for (const argId of expr.args) {
				const argNode = nodeMap.get(argId);
				if (!argNode) {
					throw CAIRSError.validation(
						"call",
						"Argument node not found: " + argId,
					);
				}
				// Ensure argument has been type-checked
				if (!nodeTypes.has(argId)) {
					throw CAIRSError.validation(
						"call",
						"Argument node not yet type-checked: " + argId,
					);
				}
			}
			return checker.typeCheck(expr, env);
		}

		case "if": {
			// Check branches exist
			if (!nodeMap.has(expr.cond)) {
				throw CAIRSError.validation(
					"if",
					"Condition node not found: " + expr.cond,
				);
			}
			if (!nodeMap.has(expr.then)) {
				throw CAIRSError.validation(
					"if",
					"Then branch node not found: " + expr.then,
				);
			}
			if (!nodeMap.has(expr.else)) {
				throw CAIRSError.validation(
					"if",
					"Else branch node not found: " + expr.else,
				);
			}

			// Condition must be bool
			const condType = nodeTypes.get(expr.cond);
			if (condType && condType.kind !== "bool") {
				throw CAIRSError.typeError(boolType, condType, "if condition");
			}

			// Branches must match the declared type
			const thenType = nodeTypes.get(expr.then);
			const elseType = nodeTypes.get(expr.else);
			if (thenType && !typeEqual(thenType, expr.type)) {
				throw CAIRSError.typeError(expr.type, thenType, "if then branch");
			}
			if (elseType && !typeEqual(elseType, expr.type)) {
				throw CAIRSError.typeError(expr.type, elseType, "if else branch");
			}

			return { type: expr.type, env };
		}

		case "let": {
			// Check value and body nodes exist
			if (!nodeMap.has(expr.value)) {
				throw CAIRSError.validation(
					"let",
					"Value node not found: " + expr.value,
				);
			}
			if (!nodeMap.has(expr.body)) {
				throw CAIRSError.validation("let", "Body node not found: " + expr.body);
			}

			// Get the value type and extend environment
			const valueType = nodeTypes.get(expr.value);
			if (!valueType) {
				throw CAIRSError.validation(
					"let",
					"Value node not yet type-checked: " + expr.value,
				);
			}

			const extendedEnv = extendTypeEnv(env, expr.name, valueType);

			// Get the body type from the body node
			const bodyType = nodeTypes.get(expr.body);
			if (!bodyType) {
				throw CAIRSError.validation(
					"let",
					"Body node not yet type-checked: " + expr.body,
				);
			}

			return { type: bodyType, env: extendedEnv };
		}

		case "airRef": {
			// Check arguments exist
			for (const argId of expr.args) {
				const argNode = nodeMap.get(argId);
				if (!argNode) {
					throw CAIRSError.validation(
						"airRef",
						"Argument node not found: " + argId,
					);
				}
				if (!nodeTypes.has(argId)) {
					throw CAIRSError.validation(
						"airRef",
						"Argument node not yet type-checked: " + argId,
					);
				}
			}
			return checker.typeCheck(expr, env);
		}

		case "predicate": {
			// Check value node exists
			if (!nodeMap.has(expr.value)) {
				throw CAIRSError.validation(
					"predicate",
					"Value node not found: " + expr.value,
				);
			}
			return { type: boolType, env };
		}

		case "lambda": {
			// Lambda body must be a node reference
			if (!nodeMap.has(expr.body)) {
				throw CAIRSError.validation(
					"lambda",
					"Body node not found: " + expr.body,
				);
			}

			if (expr.type.kind !== "fn") {
				throw CAIRSError.typeError(
					{ kind: "fn", params: [], returns: intType },
					expr.type,
					"lambda",
				);
			}

			const lambdaType = expr.type;
			// Create environment with parameter types
			let lambdaEnv = env;
			for (let i = 0; i < expr.params.length; i++) {
				const paramType = lambdaType.params[i];
				if (paramType === undefined) {
					throw CAIRSError.validation(
						"lambda",
						"Missing parameter type at index " + i,
					);
				}
				const paramName = expr.params[i];
				if (paramName === undefined) {
					throw CAIRSError.validation(
						"lambda",
						"Missing parameter name at index " + i,
					);
				}
				lambdaEnv = extendTypeEnv(lambdaEnv, paramName, paramType);
			}

			// Check that body type matches return type
			const bodyType = nodeTypes.get(expr.body);
			if (bodyType && !typeEqual(bodyType, lambdaType.returns)) {
				throw CAIRSError.typeError(lambdaType.returns, bodyType, "lambda body");
			}

			return { type: expr.type, env };
		}

		case "callExpr": {
			// Check function and arguments exist
			if (!nodeMap.has(expr.fn)) {
				throw CAIRSError.validation(
					"callExpr",
					"Function node not found: " + expr.fn,
				);
			}
			for (const argId of expr.args) {
				if (!nodeMap.has(argId)) {
					throw CAIRSError.validation(
						"callExpr",
						"Argument node not found: " + argId,
					);
				}
				if (!nodeTypes.has(argId)) {
					throw CAIRSError.validation(
						"callExpr",
						"Argument node not yet type-checked: " + argId,
					);
				}
			}

			// Get function type and check arguments
			const fnType = nodeTypes.get(expr.fn);
			if (!fnType) {
				throw CAIRSError.validation(
					"callExpr",
					"Function node not yet type-checked: " + expr.fn,
				);
			}
			if (fnType.kind !== "fn") {
				throw CAIRSError.typeError(
					fnTypeCtor([], intType),
					fnType,
					"callExpr function",
				);
			}
			if (fnType.params.length !== expr.args.length) {
				throw CAIRSError.arityError(
					fnType.params.length,
					expr.args.length,
					"callExpr",
				);
			}

			// Check each argument type
			for (let i = 0; i < expr.args.length; i++) {
				const argId = expr.args[i];
				if (argId === undefined) {
					throw CAIRSError.validation(
						"callExpr",
						"Missing argument id at index " + i,
					);
				}
				const argType = nodeTypes.get(argId);
				const expectedParamType = fnType.params[i];
				if (expectedParamType === undefined) {
					throw CAIRSError.validation(
						"callExpr",
						"Missing parameter type at index " + i,
					);
				}
				if (argType && !typeEqual(argType, expectedParamType)) {
					throw CAIRSError.typeError(
						expectedParamType,
						argType,
						"callExpr argument " + String(i),
					);
				}
			}

			return { type: fnType.returns, env };
		}

		case "fix": {
			// Check function node exists
			if (!nodeMap.has(expr.fn)) {
				throw CAIRSError.validation(
					"fix",
					"Function node not found: " + expr.fn,
				);
			}

			// Get function type and verify it has the form fn(τ) -> τ
			const fnType = nodeTypes.get(expr.fn);
			if (!fnType) {
				throw CAIRSError.validation(
					"fix",
					"Function node not yet type-checked: " + expr.fn,
				);
			}
			if (fnType.kind !== "fn") {
				throw CAIRSError.typeError(
					fnTypeCtor([], intType),
					fnType,
					"fix function",
				);
			}
			if (fnType.params.length !== 1) {
				throw CAIRSError.arityError(1, fnType.params.length, "fix");
			}
			const firstParam = fnType.params[0];
			if (firstParam === undefined) {
				throw CAIRSError.validation("fix", "Missing parameter type");
			}
			if (!typeEqual(firstParam, fnType.returns)) {
				throw CAIRSError.typeError(firstParam, fnType.returns, "fix");
			}
			if (!typeEqual(fnType.returns, expr.type)) {
				throw CAIRSError.typeError(expr.type, fnType.returns, "fix");
			}

			return { type: expr.type, env };
		}

		default:
			return exhaustive(expr);
	}
}

//==============================================================================
// EIR Type Checking (Expression-based Imperative Representation)
//==============================================================================

// EIR expression kinds
const EIR_EXPRESSION_KINDS = [
	"seq",
	"assign",
	"while",
	"for",
	"iter",
	"effect",
	"refCell",
	"deref",
] as const;

/**
 * Type check an EIR program with mutation and effects.
 */
export function typeCheckEIRProgram(
	doc: import("./types.js").EIRDocument,
	registry: OperatorRegistry,
	defs: Defs,
	effects: import("./effects.js").EffectRegistry,
): { nodeTypes: Map<string, Type>; resultType: Type } {
	const checker = new TypeChecker(registry, defs);
	const nodeTypes = new Map<string, Type>();
	const nodeEnvs = new Map<string, TypeEnv>();

	// Build a map of nodes for easy lookup
	const nodeMap = new Map<string, Node>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	// Track mutable variable types (for ref cells)
	const mutableTypes = new Map<string, Type>();

	// Type check each node in order
	for (const node of doc.nodes) {
		let env = emptyTypeEnv();

		const result = typeCheckEIRNode(
			checker,
			node,
			nodeMap,
			nodeTypes,
			nodeEnvs,
			mutableTypes,
			env,
			effects,
			registry,
		);
		nodeTypes.set(node.id, result.type);
		nodeEnvs.set(node.id, result.env);
	}

	// Get the result type
	const resultType = nodeTypes.get(doc.result);
	if (!resultType) {
		throw CAIRSError.validation(
			"result",
			"Result node not found: " + doc.result,
		);
	}

	return { nodeTypes, resultType };
}

/**
 * Type check a single EIR node
 */
function typeCheckEIRNode(
	checker: TypeChecker,
	node: Node,
	nodeMap: Map<string, Node>,
	nodeTypes: Map<string, Type>,
	nodeEnvs: Map<string, TypeEnv>,
	mutableTypes: Map<string, Type>,
	env: TypeEnv,
	effects: import("./effects.js").EffectRegistry,
	_registry: OperatorRegistry,
): TypeCheckResult {
	const expr = node.expr;
	const kind = expr.kind as string;

	// Check if this is an EIR-specific expression
	if (EIR_EXPRESSION_KINDS.includes(kind as typeof EIR_EXPRESSION_KINDS[number])) {
		switch (kind) {
			case "seq": {
				const e = expr as unknown as { first: string; then: string };
				// T-Seq: Γ ⊢ first : T, Γ ⊢ then : U ⇒ Γ ⊢ seq(first, then) : U
				if (!nodeMap.has(e.first)) {
					throw CAIRSError.validation(
						"seq",
						"First node not found: " + e.first,
					);
				}
				if (!nodeMap.has(e.then)) {
					throw CAIRSError.validation(
						"seq",
						"Then node not found: " + e.then,
					);
				}

				const firstType = nodeTypes.get(e.first);
				if (!firstType) {
					throw CAIRSError.validation(
						"seq",
						"First node not yet type-checked: " + e.first,
					);
				}

				const thenType = nodeTypes.get(e.then);
				if (!thenType) {
					throw CAIRSError.validation(
						"seq",
						"Then node not yet type-checked: " + e.then,
					);
				}

				return { type: thenType, env };
			}

			case "assign": {
				const e = expr as unknown as { target: string; value: string };
				// T-Assign: Γ ⊢ value : T ⇒ Γ ⊢ assign(target, value) : void
				if (!nodeMap.has(e.value)) {
					throw CAIRSError.validation(
						"assign",
						"Value node not found: " + e.value,
					);
				}

				const valueType = nodeTypes.get(e.value);
				if (!valueType) {
					throw CAIRSError.validation(
						"assign",
						"Value node not yet type-checked: " + e.value,
					);
				}

				// Update mutable types for the target
				mutableTypes.set(e.target, valueType);

				return { type: voidType, env };
			}

			case "while": {
				const e = expr as unknown as { cond: string; body: string };
				// T-While: Γ ⊢ cond : bool, Γ ⊢ body : T ⇒ Γ ⊢ while(cond, body) : void
				if (!nodeMap.has(e.cond)) {
					throw CAIRSError.validation(
						"while",
						"Condition node not found: " + e.cond,
					);
				}
				if (!nodeMap.has(e.body)) {
					throw CAIRSError.validation(
						"while",
						"Body node not found: " + e.body,
					);
				}

				const condType = nodeTypes.get(e.cond);
				if (condType && condType.kind !== "bool") {
					throw CAIRSError.typeError(boolType, condType, "while condition");
				}

				return { type: voidType, env };
			}

			case "for": {
				const e = expr as unknown as { var: string; init: string; cond: string; update: string; body: string };
				// T-For: (complex typing with var binding)
				if (!nodeMap.has(e.init)) {
					throw CAIRSError.validation(
						"for",
						"Init node not found: " + e.init,
					);
				}
				if (!nodeMap.has(e.cond)) {
					throw CAIRSError.validation(
						"for",
						"Condition node not found: " + e.cond,
					);
				}
				if (!nodeMap.has(e.update)) {
					throw CAIRSError.validation(
						"for",
						"Update node not found: " + e.update,
					);
				}
				if (!nodeMap.has(e.body)) {
					throw CAIRSError.validation(
						"for",
						"Body node not found: " + e.body,
					);
				}

				const condType = nodeTypes.get(e.cond);
				if (condType && condType.kind !== "bool") {
					throw CAIRSError.typeError(boolType, condType, "for condition");
				}

				// Get the loop variable type from init
				const initType = nodeTypes.get(e.init);
				if (initType) {
					mutableTypes.set(e.var, initType);
				}

				return { type: voidType, env };
			}

			case "iter": {
				const e = expr as unknown as { var: string; iter: string; body: string };
				// T-Iter: Γ ⊢ iter : list<T>, Γ ⊢ body : R ⇒ Γ ⊢ iter(var, iter, body) : void
				if (!nodeMap.has(e.iter)) {
					throw CAIRSError.validation(
						"iter",
						"Iter node not found: " + e.iter,
					);
				}
				if (!nodeMap.has(e.body)) {
					throw CAIRSError.validation(
						"iter",
						"Body node not found: " + e.body,
					);
				}

				const iterType = nodeTypes.get(e.iter);
				if (iterType && iterType.kind !== "list") {
					throw CAIRSError.typeError(
						listType(intType),
						iterType,
						"iter iterable",
					);
				}

				// Set the loop variable type
				if (iterType && iterType.kind === "list") {
					mutableTypes.set(e.var, iterType.of);
				}

				return { type: voidType, env };
			}

			case "effect": {
				const e = expr as unknown as { op: string; args: string[] };
				// T-Effect: Look up effect signature, check args
				const effect = effects.get(e.op);
				if (!effect) {
					throw CAIRSError.validation(
						"effect",
						"Unknown effect operation: " + e.op,
					);
				}

				// Check arity
				if (effect.params.length !== e.args.length) {
					throw CAIRSError.arityError(
						effect.params.length,
						e.args.length,
						"effect:" + e.op,
					);
				}

				// Check argument types
				for (let i = 0; i < e.args.length; i++) {
					const argId = e.args[i];
					if (argId === undefined) {
						throw CAIRSError.validation(
							"effect",
							"Missing argument id at index " + String(i),
						);
					}
					const argType = nodeTypes.get(argId);
					const expectedParamType = effect.params[i];
					if (expectedParamType === undefined) {
						throw CAIRSError.validation(
							"effect",
							"Missing parameter type at index " + String(i),
						);
					}
					if (argType && !typeEqual(argType, expectedParamType)) {
						throw CAIRSError.typeError(
							expectedParamType,
							argType,
							"effect argument " + String(i),
						);
					}
				}

				return { type: effect.returns, env };
			}

			case "refCell": {
				const e = expr as unknown as { target: string };
				// T-RefCell: Γ ⊢ target : T ⇒ Γ ⊢ refCell(target) : ref<T>
				let targetType: Type | undefined;

				// Check if target is a mutable variable
				targetType = mutableTypes.get(e.target);

				// If not in mutable types, check node map
				if (!targetType && nodeMap.has(e.target)) {
					targetType = nodeTypes.get(e.target);
				}

				// If not in node map, check environment
				if (!targetType) {
					targetType = lookupType(env, e.target);
				}

				if (!targetType) {
					throw CAIRSError.unboundIdentifier(e.target);
				}

				return { type: refType(targetType), env };
			}

			case "deref": {
				const e = expr as unknown as { target: string };
				// T-Deref: Γ ⊢ target : ref<T> ⇒ Γ ⊢ deref(target) : T
				let targetType: Type | undefined;

				// Check mutable types first
				targetType = mutableTypes.get(e.target);

				// Then check node map
				if (!targetType && nodeMap.has(e.target)) {
					targetType = nodeTypes.get(e.target);
				}

				// Then check environment
				if (!targetType) {
					targetType = lookupType(env, e.target);
				}

				if (!targetType) {
					throw CAIRSError.unboundIdentifier(e.target);
				}

				if (targetType.kind !== "ref") {
					throw CAIRSError.typeError(
						refType(intType),
						targetType,
						"deref target",
					);
				}

				return { type: targetType.of, env };
			}

			default:
				// Should not reach here due to EIR_EXPRESSION_KINDS check
				return { type: voidType, env };
		}
	}

	// Fall through to CIR/AIR type checking
	return typeCheckNode(
		checker,
		node,
		nodeMap,
		nodeTypes,
		nodeEnvs,
		env,
	);
}

// CAIRS Type Checker
// Implements typing rules: Γ ⊢ e : τ

import { lookupOperator, type OperatorRegistry } from "./domains/registry.js";
import { TypeEnv, emptyTypeEnv, extendTypeEnv, lookupDef, lookupType, type Defs } from "./env.js";
import { CAIRSError, exhaustive } from "./errors.js";
import type { AIRDocument, AirHybridNode, EirHybridNode, Expr, Node, Type } from "./types.js";
import { isBlockNode, isExprNode } from "./types.js";
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

export interface TypeCheckResult {
	type: Type;
	env: TypeEnv;
}

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
	 *
	 * Note: For var expressions that reference let-bound variables, we defer
	 * strict type checking and return a default type. The actual type is determined
	 * when the let expression is processed with the extended environment.
	 */
	private typeCheckVar(
		expr: { kind: "var"; name: string },
		env: TypeEnv,
	): TypeCheckResult {
		const type = lookupType(env, expr.name);
		if (!type) {
			// Variable not found in environment - this might be a let-bound variable
			// Return a default type for now; the actual type will be resolved when
			// the let expression is processed with the extended environment
			return { type: intType, env };
		}
		return { type, env };
	}

	/**
	 * T-Ref: refs are type-checked by looking up the target node
	 *        The actual typing is done during program type checking
	 */
	private typeCheckRef(
		expr: { kind: "ref"; id: string },
		env: TypeEnv,
	): TypeCheckResult {
		// Check if this is a variable reference (let-bound or lambda param)
		const varType = env.get(expr.id);
		if (varType) {
			return { type: varType, env };
		}

		// Otherwise, this is a node reference to be resolved during program type checking
		throw new Error("Ref must be resolved during program type checking");
	}

	/**
	 * T-Call: find operator signature and check argument types
	 */
	private typeCheckCall(
		expr: { kind: "call"; ns: string; name: string; args: (string | Expr)[] },
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

		// Type check each argument
		for (let i = 0; i < expr.args.length; i++) {
			const arg = expr.args[i];
			const expectedType = op.params[i];

			if (arg === undefined || expectedType === undefined) {
				continue; // Should not happen due to arity check above
			}

			if (typeof arg === "string") {
				// Node reference - type is checked during program type checking
				// No additional checking needed here
				continue;
			}

			// Inline expression - type check it
			if ("kind" in arg) {
				const argResult = this.typeCheck(arg, env);
				if (!typeEqual(argResult.type, expectedType)) {
					throw CAIRSError.typeError(
						expectedType,
						argResult.type,
						`argument ${i + 1} of ${expr.ns}:${expr.name}`,
					);
				}
			}
		}

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
 * Collect all lambda parameters and let binding names from a CIR program.
 * This is used to recognize valid identifiers during type checking.
 */
function collectLambdaParamsAndLetBindings(
	nodes: AirHybridNode[],
): Set<string> {
	const params = new Set<string>();

	const collectFromExpr = (expr: Expr): void => {
		if (expr.kind === "lambda") {
			for (const p of expr.params) {
				params.add(p);
			}
		} else if (expr.kind === "let") {
			params.add(expr.name);
		}
	};

	for (const node of nodes) {
		// Only collect from expr nodes
		if (isExprNode(node)) {
			collectFromExpr(node.expr);
		}
	}

	return params;
}

/**
 * Identify "bound nodes" - nodes that are only reachable through lambda bodies.
 * These should be skipped during top-level type checking and processed when
 * their containing lambda is checked.
 */
function identifyBoundNodes(
	nodes: AirHybridNode[],
	nodeMap: Map<string, AirHybridNode>,
): Set<string> {
	const boundNodes = new Set<string>();
	const lambdaBodies = new Set<string>();

	// First pass: collect all lambda body node IDs and their transitive dependencies
	const collectLambdaBodyDeps = (nodeId: string, visited: Set<string>): void => {
		if (visited.has(nodeId)) return;
		visited.add(nodeId);
		boundNodes.add(nodeId);

		const node = nodeMap.get(nodeId);
		if (!node) return;

		// Block nodes don't have expressions to traverse
		if (isBlockNode(node)) return;

		const expr = node.expr;
		// Collect references from the expression
		if (expr.kind === "lambda") {
			collectLambdaBodyDeps(expr.body, visited);
		} else if (expr.kind === "let") {
			if (typeof expr.value === "string") {
				collectLambdaBodyDeps(expr.value, visited);
			}
			if (typeof expr.body === "string") {
				collectLambdaBodyDeps(expr.body, visited);
			}
		} else if (expr.kind === "if") {
			if (typeof expr.cond === "string") collectLambdaBodyDeps(expr.cond, visited);
			if (typeof expr.then === "string") collectLambdaBodyDeps(expr.then, visited);
			if (typeof expr.else === "string") collectLambdaBodyDeps(expr.else, visited);
		} else if (expr.kind === "callExpr") {
			if (nodeMap.has(expr.fn)) collectLambdaBodyDeps(expr.fn, visited);
			for (const argId of expr.args) {
				if (nodeMap.has(argId)) collectLambdaBodyDeps(argId, visited);
			}
		} else if (expr.kind === "call") {
			for (const arg of expr.args) {
				if (typeof arg === "string" && nodeMap.has(arg)) {
					collectLambdaBodyDeps(arg, visited);
				}
			}
		} else if (expr.kind === "ref") {
			if (nodeMap.has(expr.id)) collectLambdaBodyDeps(expr.id, visited);
		}
	};

	// Collect lambda bodies first
	for (const node of nodes) {
		if (isExprNode(node) && node.expr.kind === "lambda") {
			lambdaBodies.add(node.expr.body);
		}
	}

	// For each lambda body, collect all transitive dependencies as bound nodes
	for (const bodyId of lambdaBodies) {
		collectLambdaBodyDeps(bodyId, new Set<string>());
	}

	// Remove lambda nodes themselves - they're not bound, only their bodies are
	for (const node of nodes) {
		if (isExprNode(node) && node.expr.kind === "lambda") {
			boundNodes.delete(node.id);
		}
	}

	return boundNodes;
}

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
	const nodeMap = new Map<string, AirHybridNode>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	// Collect lambda parameters and let bindings for identifier recognition
	const lambdaParams = collectLambdaParamsAndLetBindings(doc.nodes);

	// Identify bound nodes (nodes only reachable through lambda bodies)
	const boundNodes = identifyBoundNodes(doc.nodes, nodeMap);

	// Type check each node in order, skipping bound nodes at top level
	for (const node of doc.nodes) {
		// Skip bound nodes - they'll be type-checked with their lambda context
		if (boundNodes.has(node.id)) {
			continue;
		}

		const env = emptyTypeEnv();

		// Type check the expression
		const result = typeCheckNode(
			checker,
			node,
			nodeMap,
			nodeTypes,
			nodeEnvs,
			env,
			lambdaParams,
			boundNodes,
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
	node: AirHybridNode,
	nodeMap: Map<string, AirHybridNode>,
	nodeTypes: Map<string, Type>,
	_nodeEnvs: Map<string, TypeEnv>,
	env: TypeEnv,
	lambdaParams: Set<string>,
	boundNodes: Set<string>,
): TypeCheckResult {
	// Handle block nodes - return the declared type or infer from return terminator
	if (isBlockNode(node)) {
		// For now, use the node's declared type or default to int
		return { type: node.type ?? intType, env };
	}

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
		// Check arguments - can be node refs (strings) or inline expressions
		for (const arg of expr.args) {
			if (typeof arg === "string") {
				// Node reference - check it exists in nodeMap
				// Skip if not found - could be a lambda parameter or other runtime binding
				const argNode = nodeMap.get(arg);
				if (argNode) {
					// Node exists, will be type-checked when processed
				}
				// If argNode is null, it might be a lambda parameter - skip validation
			}
			// Inline expressions will be type-checked by checker.typeCheck()
		}
		return checker.typeCheck(expr, env);
	}

	case "if": {
		// Support both node references (strings) and inline expressions (objects)
		// For node references, we require expr.type to be declared
		// For inline expressions, type is inferred from branches

		let condType: Type;
		if (typeof expr.cond === "string") {
			// Node reference - can also be a lambda param or let-bound variable
			const condIsNode = nodeMap.has(expr.cond);
			const condIsParam = lambdaParams.has(expr.cond);
			if (!condIsNode && !condIsParam) {
				throw CAIRSError.validation(
					"if",
					"Condition node not found: " + expr.cond,
				);
			}
			const nodeCondType = nodeTypes.get(expr.cond);
			// If not yet type-checked, use bool as placeholder
			condType = nodeCondType ?? boolType;
		} else {
			// Inline expression
			const condResult = checker.typeCheck(expr.cond as Expr, env);
			condType = condResult.type;
		}

		// Only validate condition type if we have a real type (not placeholder)
		if (nodeTypes.has(typeof expr.cond === "string" ? expr.cond : "")) {
			if (condType.kind !== "bool") {
				throw CAIRSError.typeError(boolType, condType, "if condition");
			}
		}

		let thenType: Type;
		if (typeof expr.then === "string") {
			if (!nodeMap.has(expr.then)) {
				throw CAIRSError.validation(
					"if",
					"Then branch node not found: " + expr.then,
				);
			}
			const nodeThenType = nodeTypes.get(expr.then);
			if (!nodeThenType) {
				// Node not yet type-checked - skip validation for now
				// Use declared type if available, or int as placeholder
				thenType = expr.type ?? { kind: "int" };
			} else {
				thenType = nodeThenType;
			}
		} else {
			const thenResult = checker.typeCheck(expr.then as Expr, env);
			thenType = thenResult.type;
		}

		let elseType: Type;
		if (typeof expr.else === "string") {
			if (!nodeMap.has(expr.else)) {
				throw CAIRSError.validation(
					"if",
					"Else branch node not found: " + expr.else,
				);
			}
			const nodeElseType = nodeTypes.get(expr.else);
			if (!nodeElseType) {
				// Node not yet type-checked - skip validation for now
				elseType = expr.type ?? { kind: "int" };
			} else {
				elseType = nodeElseType;
			}
		} else {
			const elseResult = checker.typeCheck(expr.else as Expr, env);
			elseType = elseResult.type;
		}

		// If type is explicitly declared, use it
		const declaredType = expr.type;
		if (declaredType) {
			// Only validate branch types if they've been type-checked
			if (nodeTypes.has(typeof expr.then === "string" ? expr.then : "")) {
				if (!typeEqual(thenType, declaredType)) {
					throw CAIRSError.typeError(declaredType, thenType, "if then branch");
				}
			}
			if (nodeTypes.has(typeof expr.else === "string" ? expr.else : "")) {
				if (!typeEqual(elseType, declaredType)) {
					throw CAIRSError.typeError(declaredType, elseType, "if else branch");
				}
			}
			return { type: declaredType, env };
		}

		// Infer type from branches (they must match and both be type-checked)
		const thenIsChecked = typeof expr.then !== "string" || nodeTypes.has(expr.then);
		const elseIsChecked = typeof expr.else !== "string" || nodeTypes.has(expr.else);

		if (thenIsChecked && elseIsChecked) {
			if (!typeEqual(thenType, elseType)) {
				throw CAIRSError.validation(
					"if",
					"Branches must have the same type for type inference",
				);
			}
			return { type: thenType, env };
		}

		// Can't infer type yet - use int type as placeholder
		return { type: { kind: "int" }, env };
	}

	case "let": {
		// Support both node references (strings) and inline expressions (objects)
		let valueType: Type;

		if (typeof expr.value === "string") {
			// Node reference - look up in nodeMap/nodeTypes
			const valueIsNode = nodeMap.has(expr.value);
			const valueIsParam = lambdaParams.has(expr.value);
			const valueIsBound = boundNodes.has(expr.value);

			if (!valueIsNode && !valueIsParam) {
				throw CAIRSError.validation(
					"let",
					"Value node not found: " + expr.value,
				);
			}

			// If value is a bound node that hasn't been type-checked yet,
			// or if it's a lambda param, use a placeholder
			const nodeValueType = nodeTypes.get(expr.value);
			if (!nodeValueType) {
				if (valueIsBound || valueIsParam) {
					// Bound node or lambda param - defer type checking
					valueType = intType; // placeholder
				} else {
					throw CAIRSError.validation(
						"let",
						"Value node not yet type-checked: " + expr.value,
					);
				}
			} else {
				valueType = nodeValueType;
			}
		} else {
			// Inline expression - type check it directly
			const valueResult = checker.typeCheck(
					expr.value as Expr,
					env,
			);
			valueType = valueResult.type;
		}

		const extendedEnv = extendTypeEnv(env, expr.name, valueType);

		// Get the body type
		let bodyType: Type;
		if (typeof expr.body === "string") {
			// Node reference - look up in nodeMap/nodeTypes
			const bodyIsNode = nodeMap.has(expr.body);
			const bodyIsParam = lambdaParams.has(expr.body);
			const bodyIsBound = boundNodes.has(expr.body);

			if (!bodyIsNode && !bodyIsParam) {
				throw CAIRSError.validation("let", "Body node not found: " + expr.body);
			}

			const nodeBodyType = nodeTypes.get(expr.body);
			if (!nodeBodyType) {
				if (bodyIsBound || bodyIsParam) {
					// Bound node or lambda param - defer type checking
					bodyType = intType; // placeholder
				} else {
					throw CAIRSError.validation(
						"let",
						"Body node not yet type-checked: " + expr.body,
					);
				}
			} else {
				bodyType = nodeBodyType;
			}
		} else {
			// Inline expression - type check it directly
			const bodyResult = checker.typeCheck(
					expr.body as Expr,
					extendedEnv,
			);
			bodyType = bodyResult.type;
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
		// Check function exists - can be a node OR a lambda parameter
		const fnIsNode = nodeMap.has(expr.fn);
		const fnIsParam = lambdaParams.has(expr.fn);
		const fnIsBound = boundNodes.has(expr.fn);

		if (!fnIsNode && !fnIsParam) {
			throw CAIRSError.validation(
				"callExpr",
				"Function node not found: " + expr.fn,
			);
		}

		// Check arguments exist - can be nodes OR lambda params
		for (const argId of expr.args) {
			const argIsNode = nodeMap.has(argId);
			const argIsParam = lambdaParams.has(argId);
			if (!argIsNode && !argIsParam) {
				throw CAIRSError.validation(
					"callExpr",
					"Argument node not found: " + argId,
				);
			}
		}

		// If fn or args are bound nodes or lambda params, we can't fully type-check here
		// Just trust the declared type on the containing lambda
		if (fnIsParam || fnIsBound) {
			// Function is a lambda parameter - we can get its type from the environment
			const fnTypeFromEnv = lookupType(env, expr.fn);
			if (fnTypeFromEnv) {
				if (fnTypeFromEnv.kind !== "fn") {
					throw CAIRSError.typeError(
						fnTypeCtor([], intType),
						fnTypeFromEnv,
						"callExpr function",
					);
				}
				return { type: fnTypeFromEnv.returns, env };
			}
			// Can't determine type - return int as placeholder
			return { type: intType, env };
		}

		// Get function type from node types
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
		// Support partial application (currying)
		if (expr.args.length > fnType.params.length) {
			throw CAIRSError.arityError(
				fnType.params.length,
				expr.args.length,
				"callExpr (too many arguments)",
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
			// Skip type check for lambda params
			if (lambdaParams.has(argId)) {
				continue;
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

		// Handle partial application (currying)
		if (expr.args.length < fnType.params.length) {
			// Return a function type with remaining parameters
			const remainingParams = fnType.params.slice(expr.args.length);
			return { type: fnTypeCtor(remainingParams, fnType.returns), env };
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

	// PIR expressions - minimal type checking for now
	case "par":
	case "spawn":
	case "await":
	case "channel":
	case "send":
	case "recv":
	case "select":
	case "race":
		// PIR expressions are not yet fully type-checked
		// Return void as default type
		return { type: voidType, env };

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
	const nodeMap = new Map<string, EirHybridNode>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	// Track mutable variable types (for ref cells)
	const mutableTypes = new Map<string, Type>();

	// EIR doesn't use lambdas in the same way as CIR, but the fallthrough needs these
	const lambdaParams = new Set<string>();
	const boundNodes = new Set<string>();

	// Type check each node in order
	for (const node of doc.nodes) {
		const env = emptyTypeEnv();

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
			lambdaParams,
			boundNodes,
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
	node: EirHybridNode,
	nodeMap: Map<string, EirHybridNode>,
	nodeTypes: Map<string, Type>,
	nodeEnvs: Map<string, TypeEnv>,
	mutableTypes: Map<string, Type>,
	env: TypeEnv,
	effects: import("./effects.js").EffectRegistry,
	_registry: OperatorRegistry,
	lambdaParams: Set<string>,
	boundNodes: Set<string>,
): TypeCheckResult {
	// Handle block nodes
	if (isBlockNode(node)) {
		return { type: node.type ?? intType, env };
	}

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
			if (iterType?.kind === "list") {
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
	// The kind check above ensures this is actually a CIR Expr, not EIR-specific
	return typeCheckNode(
		checker,
		node as Node,
		nodeMap as Map<string, Node>,
		nodeTypes,
		nodeEnvs,
		env,
		lambdaParams,
		boundNodes,
	);
}

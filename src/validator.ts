// CAIRS Schema Validator
// Manual structural validation for AIR and CIR documents

import {
	invalidResult,
	ValidationError,
	ValidationResult,
	validResult,
} from "./errors.js";
import type { AIRDef, AIRDocument, CIRDocument, Expr, Type } from "./types.js";

//==============================================================================
// Validation Patterns
//==============================================================================

const ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

//==============================================================================
// Validation State
//==============================================================================

interface ValidationState {
	errors: ValidationError[];
	path: string[];
}

function pushPath(state: ValidationState, segment: string): void {
	state.path.push(segment);
}

function popPath(state: ValidationState): void {
	state.path.pop();
}

function currentPath(state: ValidationState): string {
	return state.path.length > 0 ? state.path.join(".") : "$";
}

function addError(
	state: ValidationState,
	message: string,
	value?: unknown,
): void {
	state.errors.push({
		path: currentPath(state),
		message,
		value,
	});
}

//==============================================================================
// Primitive Validators
//==============================================================================

function validateString(value: unknown): boolean {
	return typeof value === "string";
}

function validateArray(value: unknown): boolean {
	return Array.isArray(value);
}

function validateObject(value: unknown): boolean {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateId(value: unknown): boolean {
	return typeof value === "string" && ID_PATTERN.test(value);
}

function validateVersion(value: unknown): boolean {
	return typeof value === "string" && SEMVER_PATTERN.test(value);
}

//==============================================================================
// Type Validation
//==============================================================================

function validateType(state: ValidationState, value: unknown): value is Type {
	if (!validateObject(value)) {
		addError(state, "Type must be an object", value);
		return false;
	}

	const t = value as Record<string, unknown>;
	if (!validateString(t.kind)) {
		addError(state, "Type must have 'kind' property", value);
		return false;
	}

	const kind = t.kind as string;

	switch (kind) {
	case "bool":
	case "int":
	case "float":
	case "string":
		return true;

	case "set":
		// Sets can use 'of', 'elem', or 'elementType' for the element type
		if (!t.of && !t.elem && !t.elementType) {
			addError(state, "set type must have 'of', 'elem', or 'elementType' property", value);
			return false;
		}
		{
			const elemProp = t.of ?? t.elem ?? t.elementType;
			const propName = t.of ? "of" : t.elem ? "elem" : "elementType";
			pushPath(state, propName);
			const ofValid = validateType(state, elemProp);
			popPath(state);
			return ofValid;
		}

	case "list":
	case "option": {
		if (!t.of) {
			addError(state, kind + " type must have 'of' property", value);
			return false;
		}
		pushPath(state, "of");
		const ofValid = validateType(state, t.of);
		popPath(state);
		return ofValid;
	}

	case "map": {
		if (!t.key || !t.value) {
			addError(
				state,
				"map type must have 'key' and 'value' properties",
				value,
			);
			return false;
		}
		pushPath(state, "key");
		const keyValid = validateType(state, t.key);
		popPath(state);
		pushPath(state, "value");
		const valValid = validateType(state, t.value);
		popPath(state);
		return keyValid && valValid;
	}

	case "opaque":
		if (!validateString(t.name)) {
			addError(state, "opaque type must have 'name' property", value);
			return false;
		}
		return true;

	case "fn": {
		if (!validateArray(t.params)) {
			addError(state, "fn type must have 'params' array", value);
			return false;
		}
		if (!t.returns) {
			addError(state, "fn type must have 'returns' property", value);
			return false;
		}
		let paramsValid = true;
		for (let i = 0; i < (t.params as unknown[]).length; i++) {
			pushPath(state, "params[" + String(i) + "]");
			if (!validateType(state, (t.params as unknown[])[i])) {
				paramsValid = false;
			}
			popPath(state);
		}
		pushPath(state, "returns");
		const returnsValid = validateType(state, t.returns);
		popPath(state);
		return paramsValid && returnsValid;
	}

	default:
		addError(state, "Unknown type kind: " + kind, value);
		return false;
	}
}

//==============================================================================
// Expression Validation
//==============================================================================

function validateExpr(
	state: ValidationState,
	value: unknown,
	allowCIR: boolean,
): value is Expr {
	if (!validateObject(value)) {
		addError(state, "Expression must be an object", value);
		return false;
	}

	const e = value as Record<string, unknown>;
	if (!validateString(e.kind)) {
		addError(state, "Expression must have 'kind' property", value);
		return false;
	}

	const kind = e.kind as string;

	switch (kind) {
	case "lit": {
		if (!e.type) {
			addError(state, "lit expression must have 'type' property", value);
			return false;
		}
		pushPath(state, "type");
		const typeValid = validateType(state, e.type);
		popPath(state);
		return typeValid;
	}

	case "ref":
		if (!validateId(e.id)) {
			addError(state, "ref expression must have valid 'id' property", value);
			return false;
		}
		return true;

	case "var":
		if (!validateId(e.name)) {
			addError(
				state,
				"var expression must have valid 'name' property",
				value,
			);
			return false;
		}
		return true;

	case "call":
		if (!validateId(e.ns) || !validateId(e.name)) {
			addError(
				state,
				"call expression must have valid 'ns' and 'name' properties",
				value,
			);
			return false;
		}
		if (!validateArray(e.args)) {
			addError(state, "call expression must have 'args' array", value);
			return false;
		}
		for (const arg of e.args as unknown[]) {
			// Args can be either string identifiers (node refs) or inline expressions (objects)
			if (!validateId(arg) && !(typeof arg === "object" && arg !== null && "kind" in arg)) {
				addError(state, "call args must be valid identifiers or expressions", arg);
				return false;
			}
			// Validate inline expression args
			if (typeof arg === "object" && arg !== null && "kind" in arg) {
				pushPath(state, "args");
				const argValid = validateExpr(state, arg as Record<string, unknown>, false);
				popPath(state);
				if (!argValid) return false;
			}
		}
		return true;

	case "if": {
		// Support both node references (strings) and inline expressions (objects)
		// Node references: cond/then/else are string IDs
		// Inline expressions: cond/then/else are expression objects
		const hasNodeRefs = validateId(e.cond) && validateId(e.then) && validateId(e.else);
		const hasInlineExprs =
				typeof e.cond === "object" && e.cond !== null &&
				typeof e.then === "object" && e.then !== null &&
				typeof e.else === "object" && e.else !== null;

		if (!hasNodeRefs && !hasInlineExprs) {
			addError(
				state,
				"if expression must have 'cond', 'then', 'else' as identifiers or expressions",
				value,
			);
			return false;
		}

		// Validate inline expressions if present
		if (!hasNodeRefs) {
			// Validate cond expression
			if (typeof e.cond === "object" && e.cond !== null) {
				pushPath(state, "cond");
				const condValid = validateExpr(state, e.cond as Record<string, unknown>, false);
				popPath(state);
				if (!condValid) return false;
			}
			// Validate then expression
			if (typeof e.then === "object" && e.then !== null) {
				pushPath(state, "then");
				const thenValid = validateExpr(state, e.then as Record<string, unknown>, false);
				popPath(state);
				if (!thenValid) return false;
			}
			// Validate else expression
			if (typeof e.else === "object" && e.else !== null) {
				pushPath(state, "else");
				const elseValid = validateExpr(state, e.else as Record<string, unknown>, false);
				popPath(state);
				if (!elseValid) return false;
			}

			// type is required for inline expressions
			if (!e.type) {
				addError(state, "if expression must have 'type' property for inline expressions", value);
				return false;
			}
			pushPath(state, "type");
			const ifTypeValid = validateType(state, e.type);
			popPath(state);
			if (!ifTypeValid) return false;
		}

		return true;
	}

	case "let": {
		// Support both node references (strings) and inline expressions (objects)
		if (!validateId(e.name)) {
			addError(state, "let expression must have 'name' identifier", value);
			return false;
		}

		// Check if value and body are node references or inline expressions
		const hasLetNodeRefs = validateId(e.value) && validateId(e.body);
		const hasLetInlineExprs =
				typeof e.value === "object" && e.value !== null &&
				typeof e.body === "object" && e.body !== null;

		if (!hasLetNodeRefs && !hasLetInlineExprs) {
			addError(
				state,
				"let expression must have 'value', 'body' as identifiers or expressions",
				value,
			);
			return false;
		}

		// Validate inline expressions if present
		if (!hasLetNodeRefs) {
			// Validate value expression
			if (typeof e.value === "object" && e.value !== null) {
				pushPath(state, "value");
				const valueValid = validateExpr(state, e.value as Record<string, unknown>, false);
				popPath(state);
				if (!valueValid) return false;
			}
			// Validate body expression
			if (typeof e.body === "object" && e.body !== null) {
				pushPath(state, "body");
				const bodyValid = validateExpr(state, e.body as Record<string, unknown>, false);
				popPath(state);
				if (!bodyValid) return false;
			}
		}

		return true;
	}

	case "airRef":
		if (!validateId(e.ns) || !validateId(e.name)) {
			addError(
				state,
				"airRef expression must have valid 'ns' and 'name' properties",
				value,
			);
			return false;
		}
		if (!validateArray(e.args)) {
			addError(state, "airRef expression must have 'args' array", value);
			return false;
		}
		for (const arg of e.args as unknown[]) {
			if (!validateId(arg)) {
				addError(state, "airRef args must be valid identifiers", arg);
				return false;
			}
		}
		return true;

	case "predicate":
		if (!validateId(e.name) || !validateId(e.value)) {
			addError(
				state,
				"predicate expression must have 'name' and 'value' identifiers",
				value,
			);
			return false;
		}
		return true;

	case "lambda": {
		if (!allowCIR) {
			addError(
				state,
				"lambda expression is only allowed in CIR documents",
				value,
			);
			return false;
		}
		if (!validateArray(e.params)) {
			addError(state, "lambda expression must have 'params' array", value);
			return false;
		}
		for (const param of e.params as unknown[]) {
			// Support both string identifiers and lambdaParam objects
			if (typeof param === "string") {
				if (!validateId(param)) {
					addError(state, "lambda param must be a valid identifier", param);
					return false;
				}
			} else if (param && typeof param === "object") {
				const lambdaParam = param as { name?: string; optional?: boolean; default?: unknown };
				if (!lambdaParam.name || !validateId(lambdaParam.name)) {
					addError(state, "lambda param must have a valid 'name' identifier", param);
					return false;
				}
				if (lambdaParam.optional !== undefined && typeof lambdaParam.optional !== "boolean") {
					addError(state, "lambda param 'optional' must be a boolean", param);
					return false;
				}
				if (lambdaParam.default !== undefined) {
					const paramsArray = e.params as unknown[];
					pushPath(state, "params[" + paramsArray.indexOf(param) + "].default");
					const defaultValid = validateExpr(state, lambdaParam.default as Expr, false);
					popPath(state);
					if (!defaultValid) {
						return false;
					}
				}
			} else {
				addError(state, "lambda param must be a string or object", param);
				return false;
			}
		}
		if (!validateId(e.body)) {
			addError(state, "lambda expression must have 'body' identifier", value);
			return false;
		}
		if (!e.type) {
			addError(state, "lambda expression must have 'type' property", value);
			return false;
		}
		pushPath(state, "type");
		const lambdaTypeValid = validateType(state, e.type);
		popPath(state);
		return lambdaTypeValid;
	}

	case "callExpr":
		if (!allowCIR) {
			addError(
				state,
				"callExpr expression is only allowed in CIR documents",
				value,
			);
			return false;
		}
		if (!validateId(e.fn)) {
			addError(
				state,
				"callExpr expression must have valid 'fn' property",
				value,
			);
			return false;
		}
		if (!validateArray(e.args)) {
			addError(state, "callExpr expression must have 'args' array", value);
			return false;
		}
		for (const arg of e.args as unknown[]) {
			// Args can be either string identifiers (node refs) or inline expressions (objects)
			if (!validateId(arg) && !(typeof arg === "object" && arg !== null && "kind" in arg)) {
				addError(state, "callExpr args must be valid identifiers or expressions", arg);
				return false;
			}
			// Validate inline expression args
			if (typeof arg === "object" && arg !== null && "kind" in arg) {
				pushPath(state, "args");
				const argValid = validateExpr(state, arg as Record<string, unknown>, false);
				popPath(state);
				if (!argValid) return false;
			}
		}
		return true;

	case "fix": {
		if (!allowCIR) {
			addError(
				state,
				"fix expression is only allowed in CIR documents",
				value,
			);
			return false;
		}
		if (!validateId(e.fn)) {
			addError(state, "fix expression must have valid 'fn' property", value);
			return false;
		}
		if (!e.type) {
			addError(state, "fix expression must have 'type' property", value);
			return false;
		}
		pushPath(state, "type");
		const fixTypeValid = validateType(state, e.type);
		popPath(state);
		return fixTypeValid;
	}

	default:
		addError(state, "Unknown expression kind: " + kind, value);
		return false;
	}
}

//==============================================================================
// AIR Definition Validation
//==============================================================================

function validateAirDef(
	state: ValidationState,
	value: unknown,
): value is AIRDef {
	if (!validateObject(value)) {
		addError(state, "airDef must be an object", value);
		return false;
	}

	const def = value as Record<string, unknown>;

	if (!validateId(def.ns)) {
		addError(state, "airDef must have valid 'ns' property", value);
		return false;
	}

	if (!validateId(def.name)) {
		addError(state, "airDef must have valid 'name' property", value);
		return false;
	}

	if (!validateArray(def.params)) {
		addError(state, "airDef must have 'params' array", value);
		return false;
	}

	for (const param of def.params as unknown[]) {
		if (!validateId(param)) {
			addError(state, "airDef params must be valid identifiers", param);
			return false;
		}
	}

	if (!def.result) {
		addError(state, "airDef must have 'result' type", value);
		return false;
	}
	pushPath(state, "result");
	const resultValid = validateType(state, def.result);
	popPath(state);

	if (!def.body) {
		addError(state, "airDef must have 'body' expression", value);
		return false;
	}
	pushPath(state, "body");
	const bodyValid = validateExpr(state, def.body, false);
	popPath(state);

	return resultValid && bodyValid;
}

//==============================================================================
// Acyclic Reference Checking
//==============================================================================

function checkAcyclic(
	state: ValidationState,
	nodes: NodeMap,
	startId: string,
	visited: Set<string>,
	path: string[],
	lambdaParams?: Set<string>, // Lambda parameters and let bindings to exclude from ref checking
): void {
	if (visited.has(startId)) {
		// Check if any node in the path is a lambda - if so, this is valid recursion, not a cycle
		// Lambda bodies are lazily evaluated, so a lambda can reference nodes that reference back
		// to the lambda without creating a true evaluation cycle (this enables recursive functions)
		let hasLambda = false;
		for (const nodeId of path) {
			const node = nodes.get(nodeId);
			if (node && "expr" in node && node.expr.kind === "lambda") {
				hasLambda = true;
				break;
			}
		}
		if (hasLambda) {
			// This is recursion through a lambda, which is allowed
			return;
		}
		addError(state, "Cyclic reference detected: " + path.join(" -> "));
		return;
	}

	const node = nodes.get(startId);
	if (!node) {
		// Skip error if this is a lambda parameter or let binding (not a node)
		if (lambdaParams?.has(startId)) {
			return;
		}
		addError(state, "Reference to non-existent node: " + startId);
		return;
	}

	visited.add(startId);

	// Skip block nodes - they don't have expressions to analyze
	if (!("expr" in node)) {
		return;
	}

	// If this node is a lambda, collect its parameters for nested checks
	if (node.expr.kind === "lambda") {
		const params = node.expr.params;
		if (Array.isArray(params)) {
			const paramSet = new Set<string>();
			// Start with the passed-in params (outer lambda parameters and let bindings)
			if (lambdaParams) {
				for (const p of lambdaParams) {
					paramSet.add(p);
				}
			}
			// Add this lambda's parameters
			for (const p of params) {
				if (typeof p === "string") {
					paramSet.add(p);
				}
			}
			// Recursively check with the new parameter set
			const result = collectRefsAndLetBindings(node.expr, paramSet);
			// Also include let bindings from this expression
			for (const b of result.letBindings) paramSet.add(b);

			for (const refId of result.refs) {
				const newPath = [...path, refId];
				checkAcyclic(state, nodes, refId, new Set(visited), newPath, paramSet);
			}
			return;
		}
	}

	const result = collectRefsAndLetBindings(node.expr, lambdaParams);
	// Combine lambda params with let bindings for recursive checks
	const combinedParams = new Set<string>(lambdaParams);
	for (const b of result.letBindings) combinedParams.add(b);

	for (const refId of result.refs) {
		// Skip checking lambda parameters and let bindings
		if (result.letBindings.has(refId)) {
			continue;
		}
		if (lambdaParams?.has(refId)) {
			continue;
		}
		const newPath = [...path, refId];
		checkAcyclic(state, nodes, refId, new Set(visited), newPath, combinedParams);
	}
}

type NodeMap = Map<string, { expr: Record<string, unknown> }>;

interface RefsAndBindings {
	refs: string[];
	letBindings: Set<string>;
}

function collectRefsAndLetBindings(
	expr: Record<string, unknown>,
	params?: Set<string>, // Parameter names and let bindings to exclude from ref collection
	letBindings?: Set<string>, // Let bindings collected so far
): RefsAndBindings {
	const refs: string[] = [];
	const bindings = new Set(letBindings);

	if (expr.kind === "ref") {
		const id = expr.id;
		if (typeof id === "string") {
			// Skip if the reference is a lambda param or let binding
			if (!params?.has(id) && !bindings.has(id)) refs.push(id);
		}
	} else if (expr.kind === "if") {
		const cond = expr.cond,
			then = expr.then,
			els = expr.else;
		// Handle node references (strings) vs inline expressions (objects)
		// Skip if the reference is a lambda param or let binding
		if (typeof cond === "string") {
			if (!params?.has(cond) && !bindings.has(cond)) refs.push(cond);
		} else if (typeof cond === "object" && cond !== null) {
			const result = collectRefsAndLetBindings(cond as Record<string, unknown>, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof then === "string") {
			if (!params?.has(then) && !bindings.has(then)) refs.push(then);
		} else if (typeof then === "object" && then !== null) {
			const result = collectRefsAndLetBindings(then as Record<string, unknown>, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof els === "string") {
			if (!params?.has(els) && !bindings.has(els)) refs.push(els);
		} else if (typeof els === "object" && els !== null) {
			const result = collectRefsAndLetBindings(els as Record<string, unknown>, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}
	} else if (expr.kind === "let") {
		const value = expr.value,
			body = expr.body;
		// Add let binding name to bindings to exclude it from ref collection
		// The binding name is a variable, not a node reference
		const letName = expr.name;
		if (typeof letName === "string") {
			bindings.add(letName);
		}

		// Handle node references (strings) vs inline expressions (objects)
		// Skip if the reference is a lambda param or let binding
		if (typeof value === "string") {
			if (!params?.has(value) && !bindings.has(value)) refs.push(value);
		} else if (typeof value === "object" && value !== null) {
			const result = collectRefsAndLetBindings(value as Record<string, unknown>, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof body === "string") {
			if (!params?.has(body) && !bindings.has(body)) refs.push(body);
		} else if (typeof body === "object" && body !== null) {
			const result = collectRefsAndLetBindings(body as Record<string, unknown>, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}
	} else if (expr.kind === "call") {
		const args = expr.args;
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") {
					// Skip if this is a parameter name or let binding, not a node reference
					if (!params?.has(arg) && !bindings.has(arg)) {
						refs.push(arg);
					}
				}
			}
		}
	} else if (expr.kind === "lambda") {
		const lambdaParams = expr.params;
		if (Array.isArray(lambdaParams)) {
			const paramSet = new Set(params ?? []);
			// Add this lambda's parameters
			for (const p of lambdaParams) {
				if (typeof p === "string") {
					paramSet.add(p);
				}
			}
			// Recursively collect refs from body, excluding lambda parameters
			const body = expr.body;
			if (typeof body === "string") {
				// Skip if the body ref is somehow a param or binding (unlikely but consistent)
				if (!paramSet.has(body) && !bindings.has(body)) refs.push(body);
			} else {
				// Body is an expression, collect refs from it with parameter awareness
				const result = collectRefsAndLetBindings(body as Record<string, unknown>, paramSet, bindings);
				refs.push(...result.refs);
				for (const b of result.letBindings) bindings.add(b);
			}
		}
	} else if (expr.kind === "callExpr") {
		const fn = expr.fn,
			args = expr.args;
		// Skip fn if it's a parameter name or let binding (e.g., calling a lambda parameter)
		if (typeof fn === "string" && !params?.has(fn) && !bindings.has(fn)) {
			refs.push(fn);
		}
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") {
					// Skip if this is a parameter name or let binding
					if (!params?.has(arg) && !bindings.has(arg)) {
						refs.push(arg);
					}
				}
			}
		}
	} else if (expr.kind === "fix") {
		const fn = expr.fn;
		if (typeof fn === "string") refs.push(fn);
	}

	return { refs, letBindings: bindings };
}

//==============================================================================
// Document Validation
//==============================================================================

export function validateAIR(doc: unknown): ValidationResult<AIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult<AIRDocument>(state.errors);
	}

	const d = doc as Record<string, unknown>;

	// Version check
	if (!validateVersion(d.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", d.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (d.capabilities !== undefined && !validateArray(d.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", d.capabilities);
		popPath(state);
	}

	// Function signatures (optional)
	if (d.functionSigs !== undefined) {
		if (!validateArray(d.functionSigs)) {
			pushPath(state, "functionSigs");
			addError(state, "functionSigs must be an array", d.functionSigs);
			popPath(state);
		}
	}

	// AIR defs check
	if (!validateArray(d.airDefs)) {
		pushPath(state, "airDefs");
		addError(state, "Document must have 'airDefs' array", d.airDefs);
		popPath(state);
	} else {
		const airDefs = d.airDefs as unknown[];
		for (let i = 0; i < airDefs.length; i++) {
			pushPath(state, "airDefs[" + String(i) + "]");
			validateAirDef(state, airDefs[i]);
			popPath(state);
		}
	}

	// Nodes check
	if (!validateArray(d.nodes)) {
		pushPath(state, "nodes");
		addError(state, "Document must have 'nodes' array", d.nodes);
		popPath(state);
	} else {
		const nodes = d.nodes as unknown[];
		const nodeIds = new Set<string>();

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			pushPath(state, "nodes[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				continue;
			}

			const n = node as Record<string, unknown>;

			// Node ID check
			if (!validateId(n.id)) {
				addError(state, "Node must have valid 'id' property", n.id);
			} else {
				// Check for duplicate IDs
				if (nodeIds.has(String(n.id))) {
					addError(state, "Duplicate node id: " + String(n.id), n.id);
				}
				nodeIds.add(String(n.id));
			}

			// Node expression or blocks check (hybrid support)
			if (validateArray(n.blocks)) {
				// Block node - validate CFG structure
				validateHybridBlockNode(state, n);
			} else if (n.expr) {
				// Expression node
				pushPath(state, "expr");
				validateExpr(state, n.expr, false);
				popPath(state);
			} else {
				addError(state, "Node must have either 'blocks' array or 'expr' property", node);
			}

			popPath(state);
		}
	}

	// Result check
	if (!validateId(d.result)) {
		pushPath(state, "result");
		addError(state, "Document must have valid 'result' reference", d.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		const nodeIds = new Set(
			(d.nodes as { id: string }[] | undefined)?.map((n) => n.id) ?? [],
		);
		if (!nodeIds.has(String(d.result))) {
			pushPath(state, "result");
			addError(
				state,
				"Result references non-existent node: " + String(d.result),
				d.result,
			);
			popPath(state);
		}
	}

	// Build node map for acyclic checking
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as {
			id: string;
			expr: Record<string, unknown>;
		}[];
		const nodeMap: NodeMap = new Map();
		for (const node of nodes) {
			if (typeof node.id === "string") {
				nodeMap.set(node.id, node);
			}
		}

		// Check each node for cycles
		for (const node of nodes) {
			if (typeof node.id === "string") {
				checkAcyclic(state, nodeMap, node.id, new Set(), [node.id]);
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult<AIRDocument>(state.errors);
	}

	return validResult(doc as AIRDocument);
}

export function validateCIR(doc: unknown): ValidationResult<CIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult<CIRDocument>(state.errors);
	}

	const d = doc as Record<string, unknown>;

	// Version check
	if (!validateVersion(d.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", d.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (d.capabilities !== undefined && !validateArray(d.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", d.capabilities);
		popPath(state);
	}

	// AIR defs check (same for CIR)
	if (!validateArray(d.airDefs)) {
		pushPath(state, "airDefs");
		addError(state, "Document must have 'airDefs' array", d.airDefs);
		popPath(state);
	} else {
		const airDefs = d.airDefs as unknown[];
		for (let i = 0; i < airDefs.length; i++) {
			pushPath(state, "airDefs[" + String(i) + "]");
			validateAirDef(state, airDefs[i]);
			popPath(state);
		}
	}

	// Nodes check (allow CIR expressions)
	if (!validateArray(d.nodes)) {
		pushPath(state, "nodes");
		addError(state, "Document must have 'nodes' array", d.nodes);
		popPath(state);
	} else {
		const nodes = d.nodes as unknown[];
		const nodeIds = new Set<string>();

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			pushPath(state, "nodes[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				continue;
			}

			const n = node as Record<string, unknown>;

			// Node ID check
			if (!validateId(n.id)) {
				addError(state, "Node must have valid 'id' property", n.id);
			} else {
				// Check for duplicate IDs
				if (nodeIds.has(String(n.id))) {
					addError(state, "Duplicate node id: " + String(n.id), n.id);
				}
				nodeIds.add(String(n.id));
			}

			// Node expression or blocks check (hybrid support, allow CIR)
			if (validateArray(n.blocks)) {
				// Block node - validate CFG structure
				validateHybridBlockNode(state, n);
			} else if (n.expr) {
				// Expression node
				pushPath(state, "expr");
				validateExpr(state, n.expr, true);
				popPath(state);
			} else {
				addError(state, "Node must have either 'blocks' array or 'expr' property", node);
			}

			popPath(state);
		}
	}

	// Result check
	if (!validateId(d.result)) {
		pushPath(state, "result");
		addError(state, "Document must have valid 'result' reference", d.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		const nodeIds = new Set(
			(d.nodes as { id: string }[] | undefined)?.map((n) => n.id) ?? [],
		);
		if (!nodeIds.has(String(d.result))) {
			pushPath(state, "result");
			addError(
				state,
				"Result references non-existent node: " + String(d.result),
				d.result,
			);
			popPath(state);
		}
	}

	// Build node map for acyclic checking and collect lambda parameters and let bindings
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as {
			id: string;
			expr: Record<string, unknown>;
		}[];
		const nodeMap: NodeMap = new Map();
		const allParamsAndBindings = new Set<string>(); // Lambda parameters AND let binding names

		// Helper to recursively collect lambda params and let bindings from an expression
		const collectParamsAndBindings = (expr: Record<string, unknown>): void => {
			if (expr.kind === "lambda") {
				const params = expr.params;
				if (Array.isArray(params)) {
					for (const p of params) {
						if (typeof p === "string") allParamsAndBindings.add(p);
					}
				}
				// Recurse into body if it's an inline expression
				if (typeof expr.body === "object" && expr.body !== null) {
					collectParamsAndBindings(expr.body as Record<string, unknown>);
				}
			} else if (expr.kind === "let") {
				// Collect let binding name
				if (typeof expr.name === "string") {
					allParamsAndBindings.add(expr.name);
				}
				// Recurse into value and body
				if (typeof expr.value === "object" && expr.value !== null) {
					collectParamsAndBindings(expr.value as Record<string, unknown>);
				}
				if (typeof expr.body === "object" && expr.body !== null) {
					collectParamsAndBindings(expr.body as Record<string, unknown>);
				}
			} else if (expr.kind === "if") {
				// Recurse into cond, then, else
				if (typeof expr.cond === "object" && expr.cond !== null) {
					collectParamsAndBindings(expr.cond as Record<string, unknown>);
				}
				if (typeof expr.then === "object" && expr.then !== null) {
					collectParamsAndBindings(expr.then as Record<string, unknown>);
				}
				if (typeof expr.else === "object" && expr.else !== null) {
					collectParamsAndBindings(expr.else as Record<string, unknown>);
				}
			}
		};

		for (const node of nodes) {
			if (typeof node.id === "string") {
				nodeMap.set(node.id, node);
				// Collect lambda parameters and let bindings from this node's expression
				if ("expr" in node) {
					collectParamsAndBindings(node.expr);
				}
			}
		}

		// Check each node for cycles
		for (const node of nodes) {
			if (typeof node.id === "string") {
				checkAcyclic(state, nodeMap, node.id, new Set(), [node.id], allParamsAndBindings);
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult<CIRDocument>(state.errors);
	}

	return validResult(doc as CIRDocument);
}

//==============================================================================
// EIR Validation
//==============================================================================

/**
 * Validate an EIR document.
 * EIR extends CIR with sequencing, mutation, loops, and effects.
 */
export function validateEIR(doc: unknown): ValidationResult<import("./types.js").EIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Validate basic document structure (same as AIR/CIR)
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult(state.errors);
	}

	const d = doc as Record<string, unknown>;

	// Validate version
	pushPath(state, "version");
	if (!validateString(d.version) || !validateVersion(d.version as string)) {
		addError(state, "Document must have valid semantic version", d.version);
	}
	popPath(state);

	// Validate capabilities (optional)
	if (d.capabilities !== undefined) {
		pushPath(state, "capabilities");
		if (!validateArray(d.capabilities)) {
			addError(state, "capabilities must be an array", d.capabilities);
		}
		popPath(state);
	}

	// Validate airDefs
	pushPath(state, "airDefs");
	if (!validateArray(d.airDefs)) {
		addError(state, "airDefs must be an array", d.airDefs);
	}
	popPath(state);

	// Validate nodes and track node IDs
	const nodeIds = new Set<string>();
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as unknown[];
		pushPath(state, "nodes");
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			pushPath(state, "[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				popPath(state);
				continue;
			}

			const n = node as Record<string, unknown>;

			// Validate node id
			pushPath(state, "id");
			if (!validateId(n.id)) {
				addError(state, "Node must have valid id", n.id);
			} else {
				const nodeId = n.id as string;
				if (nodeIds.has(nodeId)) {
					addError(state, "Duplicate node id: " + nodeId, nodeId);
				}
				nodeIds.add(nodeId);
			}
			popPath(state);

			// Validate expr or blocks (hybrid support, allow both CIR and EIR expressions)
			if (validateArray(n.blocks)) {
				// Block node - validate CFG structure
				validateHybridBlockNode(state, n);
			} else if (validateObject(n.expr)) {
				// Expression node
				pushPath(state, "expr");
				const expr = n.expr as Record<string, unknown>;
				validateEirExpr(state, expr);
				popPath(state);
			} else {
				addError(state, "Node must have either 'blocks' array or 'expr' property", n);
			}

			popPath(state);
		}
		popPath(state);
	} else {
		addError(state, "nodes must be an array", d.nodes);
	}

	// Validate result reference
	pushPath(state, "result");
	if (!validateId(d.result)) {
		addError(state, "Result must be a valid identifier", d.result);
	} else {
		const resultId = d.result as string;
		if (!nodeIds.has(resultId)) {
			addError(state, "Result references non-existent node: " + resultId, resultId);
		}
	}
	popPath(state);

	// Validate node references in EIR expressions
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as unknown[];
		for (const node of nodes) {
			if (validateObject(node)) {
				const n = node as Record<string, unknown>;
				if (n.expr && validateObject(n.expr)) {
					const expr = n.expr as Record<string, unknown>;
					validateEirNodeReferences(state, expr, nodeIds);
				}
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult(state.errors);
	}

	return validResult(doc as import("./types.js").EIRDocument);
}

/**
 * Validate EIR-specific expressions
 */
function validateEirExpr(state: ValidationState, expr: Record<string, unknown>): void {
	if (!validateString(expr.kind)) {
		addError(state, "Expression must have 'kind' property", expr);
		return;
	}

	const kind = expr.kind as string;

	switch (kind) {
	case "seq":
		if (!validateId(expr.first)) {
			addError(state, "seq expression must have valid 'first' identifier", expr);
		}
		if (!validateId(expr.then)) {
			addError(state, "seq expression must have valid 'then' identifier", expr);
		}
		break;

	case "assign":
		if (!validateId(expr.target)) {
			addError(state, "assign expression must have valid 'target' identifier", expr);
		}
		if (!validateId(expr.value)) {
			addError(state, "assign expression must have valid 'value' identifier", expr);
		}
		break;

	case "while":
		if (!validateId(expr.cond)) {
			addError(state, "while expression must have valid 'cond' identifier", expr);
		}
		if (!validateId(expr.body)) {
			addError(state, "while expression must have valid 'body' identifier", expr);
		}
		break;

	case "for":
		if (!validateId(expr.var)) {
			addError(state, "for expression must have valid 'var' identifier", expr);
		}
		if (!validateId(expr.init)) {
			addError(state, "for expression must have valid 'init' identifier", expr);
		}
		if (!validateId(expr.cond)) {
			addError(state, "for expression must have valid 'cond' identifier", expr);
		}
		if (!validateId(expr.update)) {
			addError(state, "for expression must have valid 'update' identifier", expr);
		}
		if (!validateId(expr.body)) {
			addError(state, "for expression must have valid 'body' identifier", expr);
		}
		break;

	case "iter":
		if (!validateId(expr.var)) {
			addError(state, "iter expression must have valid 'var' identifier", expr);
		}
		if (!validateId(expr.iter)) {
			addError(state, "iter expression must have valid 'iter' identifier", expr);
		}
		if (!validateId(expr.body)) {
			addError(state, "iter expression must have valid 'body' identifier", expr);
		}
		break;

	case "effect":
		if (!validateString(expr.op)) {
			addError(state, "effect expression must have valid 'op' string", expr);
		}
		if (!validateArray(expr.args)) {
			addError(state, "effect expression must have 'args' array", expr);
		} else {
			for (const arg of expr.args as unknown[]) {
				if (!validateId(arg)) {
					addError(state, "effect args must be valid identifiers", arg);
				}
			}
		}
		break;

	case "try":
		if (!validateId(expr.tryBody)) {
			addError(state, "try expression must have valid 'tryBody' identifier", expr);
		}
		if (!validateId(expr.catchParam)) {
			addError(state, "try expression must have valid 'catchParam' identifier", expr);
		}
		if (!validateId(expr.catchBody)) {
			addError(state, "try expression must have valid 'catchBody' identifier", expr);
		}
		if (expr.fallback !== undefined && !validateId(expr.fallback)) {
			addError(state, "try expression fallback must be a valid identifier", expr);
		}
		break;

	case "refCell":
		if (!validateId(expr.target)) {
			addError(state, "refCell expression must have valid 'target' identifier", expr);
		}
		break;

	case "deref":
		if (!validateId(expr.target)) {
			addError(state, "deref expression must have valid 'target' identifier", expr);
		}
		break;

		// CIR and AIR expressions are already validated by validateCIR
	case "lit":
	case "ref":
	case "var":
	case "call":
	case "if":
	case "let":
	case "airRef":
	case "predicate":
	case "lambda":
	case "callExpr":
	case "fix":
		// Already validated
		break;

	default:
		addError(state, "Unknown expression kind in EIR: " + kind, expr);
		break;
	}
}

/**
 * Validate node references in EIR expressions.
 */
function validateEirNodeReferences(
	state: ValidationState,
	expr: Record<string, unknown>,
	nodeIds: Set<string>,
): void {
	if (!validateString(expr.kind)) {
		return;
	}

	const kind = expr.kind as string;

	// Helper to check a node reference
	const checkRef = (ref: unknown, name: string) => {
		if (validateId(ref)) {
			const refId = ref as string;
			if (!nodeIds.has(refId)) {
				addError(state, name + " references non-existent node: " + refId, refId);
			}
		}
	};

	switch (kind) {
	case "seq":
		checkRef(expr.first, "seq.first");
		checkRef(expr.then, "seq.then");
		break;

	case "assign":
		checkRef(expr.value, "assign.value");
		break;

	case "while":
		checkRef(expr.cond, "while.cond");
		checkRef(expr.body, "while.body");
		break;

	case "for":
		checkRef(expr.init, "for.init");
		checkRef(expr.cond, "for.cond");
		checkRef(expr.update, "for.update");
		checkRef(expr.body, "for.body");
		break;

	case "iter":
		checkRef(expr.iter, "iter.iter");
		checkRef(expr.body, "iter.body");
		break;

	case "effect":
		if (validateArray(expr.args)) {
			for (let i = 0; i < (expr.args as unknown[]).length; i++) {
				checkRef((expr.args as unknown[])[i], "effect.args[" + String(i) + "]");
			}
		}
		break;

	case "try":
		checkRef(expr.tryBody, "try.tryBody");
		checkRef(expr.catchBody, "try.catchBody");
		if (expr.fallback !== undefined) {
			checkRef(expr.fallback, "try.fallback");
		}
		break;

	case "refCell":
	case "deref":
	case "lit":
	case "ref":
	case "var":
	case "call":
	case "if":
	case "let":
	case "airRef":
	case "predicate":
	case "lambda":
	case "callExpr":
	case "fix":
		// These don't have node references that need validation
		break;

	default:
		break;
	}
}

//==============================================================================
// LIR Validation
//==============================================================================

/**
 * Validate an LIR document.
 * LIR uses nodes/result structure where nodes contain CFG blocks.
 */
export function validateLIR(doc: unknown): ValidationResult<import("./types.js").LIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "LIR Document must be an object", doc);
		return invalidResult(state.errors);
	}

	const d = doc as Record<string, unknown>;

	// Version check
	if (!validateVersion(d.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", d.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (d.capabilities !== undefined && !validateArray(d.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", d.capabilities);
		popPath(state);
	}

	// Nodes check
	if (!validateArray(d.nodes)) {
		pushPath(state, "nodes");
		addError(state, "LIR Document must have 'nodes' array", d.nodes);
		popPath(state);
		return invalidResult(state.errors);
	}

	const nodes = d.nodes as unknown[];
	const nodeIds = new Set<string>();

	// Validate each node
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		pushPath(state, "nodes[" + String(i) + "]");

		if (!validateObject(node)) {
			addError(state, "Node must be an object", node);
			popPath(state);
			continue;
		}

		const n = node as Record<string, unknown>;

		// Node ID check
		if (!validateId(n.id)) {
			addError(state, "Node must have valid 'id' property", n.id);
		} else {
			if (nodeIds.has(String(n.id))) {
				addError(state, "Duplicate node id: " + String(n.id), n.id);
			}
			nodeIds.add(String(n.id));
		}

		// Check if this is a block node (has blocks/entry) or expression node (has expr)
		if (validateArray(n.blocks)) {
			// Block node - validate CFG structure
			validateLirBlockNode(state, n);
		} else if (n.expr !== undefined) {
			// Expression node - validate expression
			pushPath(state, "expr");
			// Basic expression validation (LIR typically uses block nodes)
			if (!validateObject(n.expr)) {
				addError(state, "Expression must be an object", n.expr);
			}
			popPath(state);
		} else {
			addError(state, "Node must have either 'blocks' array or 'expr' property", node);
		}

		popPath(state);
	}

	// Result check
	if (!validateId(d.result)) {
		pushPath(state, "result");
		addError(state, "LIR Document must have valid 'result' reference", d.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		if (!nodeIds.has(String(d.result))) {
			pushPath(state, "result");
			addError(
				state,
				"Result references non-existent node: " + String(d.result),
				d.result,
			);
			popPath(state);
		}
	}

	if (state.errors.length > 0) {
		return invalidResult(state.errors);
	}

	return validResult(doc as import("./types.js").LIRDocument);
}

/**
 * Validate a hybrid block node for AIR/CIR/EIR documents.
 * This validates the CFG structure (blocks/entry) that can be used
 * as an alternative to expressions in hybrid documents.
 */
function validateHybridBlockNode(state: ValidationState, n: Record<string, unknown>): void {
	const blocks = n.blocks as unknown[];
	const blockIds = new Set<string>();

	// Validate each block
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		pushPath(state, "blocks[" + String(i) + "]");

		if (!validateObject(block)) {
			addError(state, "Block must be an object", block);
			popPath(state);
			continue;
		}

		const b = block as Record<string, unknown>;

		// Block ID check
		if (!validateId(b.id)) {
			addError(state, "Block must have valid 'id' property", b.id);
		} else {
			if (blockIds.has(String(b.id))) {
				addError(state, "Duplicate block id: " + String(b.id), b.id);
			}
			blockIds.add(String(b.id));
		}

		// Instructions check
		if (!validateArray(b.instructions)) {
			addError(state, "Block must have 'instructions' array", b.instructions);
		} else {
			const instructions = b.instructions as unknown[];
			for (let j = 0; j < instructions.length; j++) {
				pushPath(state, "instructions[" + String(j) + "]");
				validateHybridInstruction(state, instructions[j]);
				popPath(state);
			}
		}

		// Terminator check
		if (!b.terminator) {
			addError(state, "Block must have 'terminator' property", block);
		} else {
			pushPath(state, "terminator");
			validateLirTerminator(state, b.terminator);
			popPath(state);
		}

		popPath(state);
	}

	// Entry check
	if (!validateId(n.entry)) {
		pushPath(state, "entry");
		addError(state, "Block node must have valid 'entry' reference", n.entry);
		popPath(state);
	} else {
		if (!blockIds.has(String(n.entry))) {
			pushPath(state, "entry");
			addError(
				state,
				"Entry references non-existent block: " + String(n.entry),
				n.entry,
			);
			popPath(state);
		}
	}
}

/**
 * Validate an instruction in a hybrid block node.
 * Allows: assign, op, phi (pure instructions for AIR/CIR/EIR hybrid nodes)
 */
function validateHybridInstruction(state: ValidationState, ins: unknown): void {
	if (!validateObject(ins)) {
		addError(state, "Instruction must be an object", ins);
		return;
	}

	const i = ins as Record<string, unknown>;
	if (!validateString(i.kind)) {
		addError(state, "Instruction must have 'kind' property", ins);
		return;
	}

	const kind = i.kind as string;

	switch (kind) {
	case "assign":
		if (!validateId(i.target)) {
			addError(state, "assign instruction must have valid 'target'", i.target);
		}
		if (!i.value) {
			addError(state, "assign instruction must have 'value' property", ins);
		}
		break;

	case "op":
		if (!validateId(i.target)) {
			addError(state, "op instruction must have valid 'target'", i.target);
		}
		if (!validateId(i.ns)) {
			addError(state, "op instruction must have valid 'ns'", i.ns);
		}
		if (!validateId(i.name)) {
			addError(state, "op instruction must have valid 'name'", i.name);
		}
		if (!validateArray(i.args)) {
			addError(state, "op instruction must have 'args' array", i.args);
		}
		break;

	case "phi":
		if (!validateId(i.target)) {
			addError(state, "phi instruction must have valid 'target'", i.target);
		}
		if (!validateArray(i.sources)) {
			addError(state, "phi instruction must have 'sources' array", i.sources);
		}
		break;

	default:
		addError(state, "Unknown or disallowed instruction kind in hybrid block: " + kind, ins);
		break;
	}
}

/**
 * Validate an LIR block node (a node with blocks/entry).
 */
function validateLirBlockNode(state: ValidationState, n: Record<string, unknown>): void {
	const blocks = n.blocks as unknown[];
	const blockIds = new Set<string>();

	// Validate each block
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		pushPath(state, "blocks[" + String(i) + "]");

		if (!validateObject(block)) {
			addError(state, "Block must be an object", block);
			popPath(state);
			continue;
		}

		const b = block as Record<string, unknown>;

		// Block ID check
		if (!validateId(b.id)) {
			addError(state, "Block must have valid 'id' property", b.id);
		} else {
			// Check for duplicate IDs
			if (blockIds.has(String(b.id))) {
				addError(state, "Duplicate block id: " + String(b.id), b.id);
			}
			blockIds.add(String(b.id));
		}

		// Instructions check
		if (!validateArray(b.instructions)) {
			addError(state, "Block must have 'instructions' array", b.instructions);
		} else {
			const instructions = b.instructions as unknown[];
			for (let j = 0; j < instructions.length; j++) {
				pushPath(state, "instructions[" + String(j) + "]");
				validateLirInstruction(state, instructions[j]);
				popPath(state);
			}
		}

		// Terminator check
		if (!b.terminator) {
			addError(state, "Block must have 'terminator' property", block);
		} else {
			pushPath(state, "terminator");
			validateLirTerminator(state, b.terminator);
			popPath(state);
		}

		popPath(state);
	}

	// Entry check
	if (!validateId(n.entry)) {
		pushPath(state, "entry");
		addError(state, "Block node must have valid 'entry' reference", n.entry);
		popPath(state);
	} else {
		// Check that entry references a valid block
		if (!blockIds.has(String(n.entry))) {
			pushPath(state, "entry");
			addError(
				state,
				"Entry references non-existent block: " + String(n.entry),
				n.entry,
			);
			popPath(state);
		}
	}

	// Validate CFG structure
	validateCFG(state, blocks as Record<string, unknown>[]);
}

/**
 * Validate an LIR instruction
 */
function validateLirInstruction(state: ValidationState, ins: unknown): void {
	if (!validateObject(ins)) {
		addError(state, "Instruction must be an object", ins);
		return;
	}

	const i = ins as Record<string, unknown>;
	if (!validateString(i.kind)) {
		addError(state, "Instruction must have 'kind' property", ins);
		return;
	}

	const kind = i.kind as string;

	switch (kind) {
	case "assign":
		if (!validateId(i.target)) {
			addError(state, "assign instruction must have valid 'target'", i.target);
		}
		if (!i.value) {
			addError(state, "assign instruction must have 'value' property", ins);
		}
		break;

	case "call":
		if (!validateId(i.target)) {
			addError(state, "call instruction must have valid 'target'", i.target);
		}
		if (!validateId(i.callee)) {
			addError(state, "call instruction must have valid 'callee'", i.callee);
		}
		if (!validateArray(i.args)) {
			addError(state, "call instruction must have 'args' array", i.args);
		}
		break;

	case "op":
		if (!validateId(i.target)) {
			addError(state, "op instruction must have valid 'target'", i.target);
		}
		if (!validateId(i.ns)) {
			addError(state, "op instruction must have valid 'ns'", i.ns);
		}
		if (!validateId(i.name)) {
			addError(state, "op instruction must have valid 'name'", i.name);
		}
		if (!validateArray(i.args)) {
			addError(state, "op instruction must have 'args' array", i.args);
		}
		break;

	case "phi":
		if (!validateId(i.target)) {
			addError(state, "phi instruction must have valid 'target'", i.target);
		}
		if (!validateArray(i.sources)) {
			addError(state, "phi instruction must have 'sources' array", i.sources);
		}
		break;

	case "effect":
		if (!validateString(i.op)) {
			addError(state, "effect instruction must have valid 'op'", i.op);
		}
		if (!validateArray(i.args)) {
			addError(state, "effect instruction must have 'args' array", i.args);
		}
		break;

	case "assignRef":
		if (!validateId(i.target)) {
			addError(state, "assignRef instruction must have valid 'target'", i.target);
		}
		if (!validateId(i.value)) {
			addError(state, "assignRef instruction must have 'value'", i.value);
		}
		break;

	default:
		addError(state, "Unknown instruction kind: " + kind, ins);
		break;
	}
}

/**
 * Validate an LIR terminator
 */
function validateLirTerminator(state: ValidationState, term: unknown): void {
	if (!validateObject(term)) {
		addError(state, "Terminator must be an object", term);
		return;
	}

	const t = term as Record<string, unknown>;
	if (!validateString(t.kind)) {
		addError(state, "Terminator must have 'kind' property", term);
		return;
	}

	const kind = t.kind as string;

	switch (kind) {
	case "jump":
		if (!validateId(t.to)) {
			addError(state, "jump terminator must have valid 'to' target", t.to);
		}
		break;

	case "branch":
		if (!validateId(t.cond)) {
			addError(state, "branch terminator must have valid 'cond'", t.cond);
		}
		if (!validateId(t.then)) {
			addError(state, "branch terminator must have valid 'then' target", t.then);
		}
		if (!validateId(t.else)) {
			addError(state, "branch terminator must have valid 'else' target", t.else);
		}
		break;

	case "return":
		// value is optional
		break;

	case "exit":
		// code is optional
		break;

	default:
		addError(state, "Unknown terminator kind: " + kind, term);
		break;
	}
}

/**
 * Validate CFG structure
 * Check that all jump/branch targets reference valid blocks
 */
function validateCFG(
	state: ValidationState,
	blocks: Record<string, unknown>[],
): void {
	const blockIds = new Set<string>();
	for (const block of blocks) {
		if (typeof block.id === "string") {
			blockIds.add(block.id);
		}
	}

	for (const block of blocks) {
		if (block.terminator && validateObject(block.terminator)) {
			const term = block.terminator as Record<string, unknown>;
			const kind = term.kind as string;

			if (kind === "jump") {
				const to = term.to;
				if (typeof to === "string" && !blockIds.has(to)) {
					addError(
						state,
						"Jump terminator references non-existent block: " + to,
						to,
					);
				}
			} else if (kind === "branch") {
				const thenTarget = term.then;
				const elseTarget = term.else;
				if (typeof thenTarget === "string" && !blockIds.has(thenTarget)) {
					addError(
						state,
						"Branch terminator references non-existent block: " + thenTarget,
						thenTarget,
					);
				}
				if (typeof elseTarget === "string" && !blockIds.has(elseTarget)) {
					addError(
						state,
						"Branch terminator references non-existent block: " + elseTarget,
						elseTarget,
					);
				}
			}
		}

		// Check phi sources reference valid blocks
		if (validateArray(block.instructions)) {
			const instructions = block.instructions as unknown[];
			for (const ins of instructions) {
				if (validateObject(ins)) {
					const i = ins as Record<string, unknown>;
					if (i.kind === "phi" && validateArray(i.sources)) {
						const sources = i.sources as unknown[];
						for (const source of sources) {
							if (validateObject(source)) {
								const s = source as Record<string, unknown>;
								const sourceBlock = s.block;
								if (
									typeof sourceBlock === "string" &&
									!blockIds.has(sourceBlock)
								) {
									addError(
										state,
										"Phi source references non-existent block: " +
											sourceBlock,
										sourceBlock,
									);
								}
							}
						}
					}
				}
			}
		}
	}
}

//==============================================================================
// PIR Validation
//==============================================================================

export function validatePIR(doc: unknown): ValidationResult<import("./types.js").PIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult<import("./types.js").PIRDocument>(state.errors);
	}

	const d = doc as Record<string, unknown>;

	// Check version (PIR uses version 2.x.x)
	if (d.version !== undefined && typeof d.version !== "string") {
		addError(state, "version must be a string", d.version);
	} else if (typeof d.version === "string" && !(/^2\.\d+\.\d+$/.exec(d.version))) {
		addError(state, "PIR version must match 2.x.x format", d.version);
	}

	// Check airDefs (optional, should be array if present)
	if (d.airDefs !== undefined && !Array.isArray(d.airDefs)) {
		addError(state, "airDefs must be an array", d.airDefs);
	}

	// Check functionSigs (optional, should be array if present)
	if (d.functionSigs !== undefined && !Array.isArray(d.functionSigs)) {
		addError(state, "functionSigs must be an array", d.functionSigs);
	}

	// Check capabilities (optional, should be array if present)
	if (d.capabilities !== undefined) {
		if (!Array.isArray(d.capabilities)) {
			addError(state, "capabilities must be an array", d.capabilities);
		} else {
			const validCapabilities = ["async", "parallel", "channels", "hybrid"];
			for (const cap of d.capabilities) {
				if (typeof cap !== "string" || !validCapabilities.includes(cap)) {
					addError(state, `Invalid capability: ${cap}`, cap);
				}
			}
		}
	}

	// Check nodes (required)
	if (!Array.isArray(d.nodes)) {
		addError(state, "nodes must be an array", d.nodes);
	} else {
		for (let i = 0; i < d.nodes.length; i++) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const node = d.nodes[i];
			pushPath(state, `nodes[${i}]`);
			validatePIRNode(node, state);
			popPath(state);
		}
	}

	// Check result (required)
	if (typeof d.result !== "string") {
		addError(state, "result must be a string (node ID)", d.result);
	}

	if (state.errors.length > 0) {
		return invalidResult<import("./types.js").PIRDocument>(state.errors);
	}

	return validResult(doc as import("./types.js").PIRDocument);
}

/**
 * Validate a PIR node (expression or block-based)
 */
function validatePIRNode(node: unknown, state: ValidationState): void {
	if (!validateObject(node)) {
		addError(state, "Node must be an object", node);
		return;
	}

	const n = node as Record<string, unknown>;

	// Check id (required)
	if (typeof n.id !== "string" || !(/^[A-Za-z][A-Za-z0-9_-]*$/.exec(n.id))) {
		addError(state, "id must be a valid identifier", n.id);
	}

	// Check type (optional)
	if (n.type !== undefined) {
		// Type validation would go here
	}

	// Check for expr OR (blocks + entry)
	const hasExpr = n.expr !== undefined;
	const hasBlocks = n.blocks !== undefined;
	const hasEntry = n.entry !== undefined;

	if (hasExpr && (hasBlocks || hasEntry)) {
		addError(state, "Node cannot have both expr and blocks", node);
	} else if (!hasExpr && (!hasBlocks || !hasEntry)) {
		addError(state, "Node must have either expr or (blocks + entry)", node);
	}

	if (hasExpr) {
		validatePIRExpr(n.expr, state);
	}

	if (hasBlocks) {
		if (!Array.isArray(n.blocks)) {
			addError(state, "blocks must be an array", n.blocks);
		} else {
			for (let i = 0; i < n.blocks.length; i++) {
				pushPath(state, `blocks[${i}]`);
				validatePIRBlock(n.blocks[i], state);
				popPath(state);
			}
		}
	}

	if (hasEntry && typeof n.entry !== "string") {
		addError(state, "entry must be a string (block ID)", n.entry);
	}
}

/**
 * Validate a PIR expression
 */
function validatePIRExpr(expr: unknown, state: ValidationState): void {
	if (!validateObject(expr)) {
		addError(state, "Expression must be an object", expr);
		return;
	}

	const e = expr as Record<string, unknown>;
	const kind = e.kind;

	if (typeof kind !== "string") {
		addError(state, "Expression must have a 'kind' field", expr);
		return;
	}

	// PIR-specific expression kinds
	const pirKinds = ["par", "spawn", "await", "channel", "send", "recv", "select", "race"];
	// EIR expression kinds (PIR extends EIR)
	const eirKinds = ["lit", "var", "call", "if", "let", "lambda", "callExpr", "fix", "seq", "assign", "while", "for", "iter", "effect", "refCell"];

	const validKinds = [...pirKinds, ...eirKinds];
	if (!validKinds.includes(kind)) {
		addError(state, `Unknown expression kind in PIR: ${kind}`, kind);
		return;
	}

	// Validate PIR-specific expressions
	switch (kind) {
	case "par":
		if (!Array.isArray(e.branches) || e.branches.length < 2) {
			addError(state, "par expression must have at least 2 branches", e.branches);
		}
		break;
	case "spawn":
		if (typeof e.task !== "string") {
			addError(state, "spawn expression must have a task (node ID)", e.task);
		}
		break;
	case "await":
		if (typeof e.future !== "string") {
			addError(state, "await expression must have a future (node ID)", e.future);
		}
		break;
	case "channel":
		if (typeof e.channelType !== "string") {
			addError(state, "channel expression must have a channelType", e.channelType);
		}
		break;
	case "send":
		if (typeof e.channel !== "string" || typeof e.value !== "string") {
			addError(state, "send expression must have channel and value (node IDs)", { channel: e.channel, value: e.value });
		}
		break;
	case "recv":
		if (typeof e.channel !== "string") {
			addError(state, "recv expression must have a channel (node ID)", e.channel);
		}
		break;
	case "select":
		if (!Array.isArray(e.futures) || e.futures.length < 1) {
			addError(state, "select expression must have at least 1 future", e.futures);
		}
		break;
	case "race":
		if (!Array.isArray(e.tasks) || e.tasks.length < 2) {
			addError(state, "race expression must have at least 2 tasks", e.tasks);
		}
		break;
	}
}

/**
 * Validate a PIR block
 */
function validatePIRBlock(block: unknown, state: ValidationState): void {
	if (!validateObject(block)) {
		addError(state, "Block must be an object", block);
		return;
	}

	const b = block as Record<string, unknown>;

	if (typeof b.id !== "string") {
		addError(state, "Block must have an id", b.id);
	}

	if (!Array.isArray(b.instructions)) {
		addError(state, "Block must have instructions array", b.instructions);
	}

	if (!validateObject(b.terminator)) {
		addError(state, "Block must have a terminator object", b.terminator);
	}
}


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
		case "list":
		case "option":
			if (!t.of) {
				addError(state, kind + " type must have 'of' property", value);
				return false;
			}
			pushPath(state, "of");
			const ofValid = validateType(state, t.of);
			popPath(state);
			return ofValid;

		case "map":
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

		case "opaque":
			if (!validateString(t.name)) {
				addError(state, "opaque type must have 'name' property", value);
				return false;
			}
			return true;

		case "fn":
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
		case "lit":
			if (!e.type) {
				addError(state, "lit expression must have 'type' property", value);
				return false;
			}
			pushPath(state, "type");
			const typeValid = validateType(state, e.type);
			popPath(state);
			return typeValid;

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
				if (!validateId(arg)) {
					addError(state, "call args must be valid identifiers", arg);
					return false;
				}
			}
			return true;

		case "if":
			if (!validateId(e.cond) || !validateId(e.then) || !validateId(e.else)) {
				addError(
					state,
					"if expression must have 'cond', 'then', 'else' identifiers",
					value,
				);
				return false;
			}
			if (!e.type) {
				addError(state, "if expression must have 'type' property", value);
				return false;
			}
			pushPath(state, "type");
			const ifTypeValid = validateType(state, e.type);
			popPath(state);
			return ifTypeValid;

		case "let":
			if (!validateId(e.name) || !validateId(e.value) || !validateId(e.body)) {
				addError(
					state,
					"let expression must have 'name', 'value', 'body' identifiers",
					value,
				);
				return false;
			}
			return true;

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

		case "lambda":
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
				if (!validateId(param)) {
					addError(state, "lambda params must be valid identifiers", param);
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
				if (!validateId(arg)) {
					addError(state, "callExpr args must be valid identifiers", arg);
					return false;
				}
			}
			return true;

		case "fix":
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
): void {
	if (visited.has(startId)) {
		addError(state, "Cyclic reference detected: " + path.join(" -> "));
		return;
	}

	const node = nodes.get(startId);
	if (!node) {
		addError(state, "Reference to non-existent node: " + startId);
		return;
	}

	visited.add(startId);

	const refs = collectRefs(node.expr);
	for (const refId of refs) {
		const newPath = [...path, refId];
		checkAcyclic(state, nodes, refId, new Set(visited), newPath);
	}
}

type NodeMap = Map<string, { expr: Record<string, unknown> }>;

function collectRefs(expr: Record<string, unknown>): string[] {
	const refs: string[] = [];

	if (expr.kind === "ref") {
		const id = expr.id;
		if (typeof id === "string") {
			refs.push(id);
		}
	} else if (expr.kind === "if") {
		const cond = expr.cond,
			then = expr.then,
			els = expr.else;
		if (typeof cond === "string") refs.push(cond);
		if (typeof then === "string") refs.push(then);
		if (typeof els === "string") refs.push(els);
	} else if (expr.kind === "let") {
		const value = expr.value,
			body = expr.body;
		if (typeof value === "string") refs.push(value);
		if (typeof body === "string") refs.push(body);
	} else if (expr.kind === "call") {
		const args = expr.args;
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") refs.push(arg);
			}
		}
	} else if (expr.kind === "airRef") {
		const args = expr.args;
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") refs.push(arg);
			}
		}
	} else if (expr.kind === "predicate") {
		const value = expr.value;
		if (typeof value === "string") refs.push(value);
	} else if (expr.kind === "lambda") {
		const body = expr.body;
		if (typeof body === "string") refs.push(body);
	} else if (expr.kind === "callExpr") {
		const fn = expr.fn,
			args = expr.args;
		if (typeof fn === "string") refs.push(fn);
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") refs.push(arg);
			}
		}
	} else if (expr.kind === "fix") {
		const fn = expr.fn;
		if (typeof fn === "string") refs.push(fn);
	}

	return refs;
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

			// Node expression check
			if (!n.expr) {
				addError(state, "Node must have 'expr' property", node);
			} else {
				pushPath(state, "expr");
				validateExpr(state, n.expr, false);
				popPath(state);
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
			(d.nodes as Array<{ id: string }> | undefined)?.map((n) => n.id) ?? [],
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
		const nodes = d.nodes as Array<{
			id: string;
			expr: Record<string, unknown>;
		}>;
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

			// Node expression check (allow CIR)
			if (!n.expr) {
				addError(state, "Node must have 'expr' property", node);
			} else {
				pushPath(state, "expr");
				validateExpr(state, n.expr, true);
				popPath(state);
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
			(d.nodes as Array<{ id: string }> | undefined)?.map((n) => n.id) ?? [],
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
		const nodes = d.nodes as Array<{
			id: string;
			expr: Record<string, unknown>;
		}>;
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
		return invalidResult<CIRDocument>(state.errors);
	}

	return validResult(doc as CIRDocument);
}

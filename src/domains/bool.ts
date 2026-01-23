// SPIRAL Bool Domain
// Boolean algebra operators

import { SPIRALError } from "../errors.js";
import type { Type, Value } from "../types.js";
import { boolType, boolVal, isError } from "../types.js";
import {
	defineOperator,
	Operator,
	OperatorRegistry,
	registerOperator,
} from "./registry.js";

//==============================================================================
// Helper Functions
//==============================================================================

function expectBool(v: Value): boolean {
	if (v.kind === "bool") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(boolType, { kind: v.kind } as Type);
}

//==============================================================================
// Boolean Operators
//==============================================================================

// and(bool, bool) -> bool
const and: Operator = defineOperator("bool", "and")
	.setParams(boolType, boolType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return boolVal(expectBool(a) && expectBool(b));
	})
	.build();

// or(bool, bool) -> bool
const or: Operator = defineOperator("bool", "or")
	.setParams(boolType, boolType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return boolVal(expectBool(a) || expectBool(b));
	})
	.build();

// not(bool) -> bool
const not: Operator = defineOperator("bool", "not")
	.setParams(boolType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return boolVal(!expectBool(a));
	})
	.build();

// xor(bool, bool) -> bool
const xor: Operator = defineOperator("bool", "xor")
	.setParams(boolType, boolType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		const av = expectBool(a);
		const bv = expectBool(b);
		return boolVal((av && !bv) || (!av && bv));
	})
	.build();

//==============================================================================
// Registry Creation
//==============================================================================

/**
 * Create the bool domain registry with all boolean operators.
 */
export function createBoolRegistry(): OperatorRegistry {
	let registry: OperatorRegistry = new Map();

	registry = registerOperator(registry, and);
	registry = registerOperator(registry, or);
	registry = registerOperator(registry, not);
	registry = registerOperator(registry, xor);

	return registry;
}

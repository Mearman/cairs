// SPIRAL Core Domain
// Arithmetic and comparison operators

import { SPIRALError, ErrorCodes } from "../errors.js";
import type { Type, Value } from "../types.js";
import {
	boolType,
	boolVal,
	errorVal,
	floatType,
	floatVal,
	intType,
	intVal,
	isError,
} from "../types.js";
import {
	defineOperator,
	Operator,
	OperatorRegistry,
	registerOperator,
} from "./registry.js";

//==============================================================================
// Helper Functions
//==============================================================================

function expectInt(v: Value): number {
	if (v.kind === "int") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(intType, { kind: v.kind } as Type);
}

function getNumeric(v: Value): number {
	if (v.kind === "int") return v.value;
	if (v.kind === "float") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(floatType, { kind: v.kind } as Type);
}

//==============================================================================
// Arithmetic Operators (Polymorphic)
//==============================================================================

// add(number, number) -> number (returns int if both args are int, else float)
const add: Operator = defineOperator("core", "add")
	.setParams(intType, intType) // Signature for type checking
	.setReturns(intType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") {
			return intVal(a.value + b.value);
		}
		return floatVal(getNumeric(a) + getNumeric(b));
	})
	.build();

// sub(number, number) -> number
const sub: Operator = defineOperator("core", "sub")
	.setParams(intType, intType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") {
			return intVal(a.value - b.value);
		}
		return floatVal(getNumeric(a) - getNumeric(b));
	})
	.build();

// mul(number, number) -> number
const mul: Operator = defineOperator("core", "mul")
	.setParams(intType, intType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") {
			return intVal(a.value * b.value);
		}
		return floatVal(getNumeric(a) * getNumeric(b));
	})
	.build();

// div(number, number) -> number
const div: Operator = defineOperator("core", "div")
	.setParams(intType, intType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		const bv = getNumeric(b);
		if (bv === 0) return errorVal(ErrorCodes.DivideByZero, "Division by zero");
		if (a.kind === "int" && b.kind === "int") {
			return intVal(Math.trunc(a.value / bv));
		}
		return floatVal(getNumeric(a) / bv);
	})
	.build();

// mod(int, int) -> int
const mod: Operator = defineOperator("core", "mod")
	.setParams(intType, intType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		const bv = expectInt(b);
		if (bv === 0) return errorVal(ErrorCodes.DivideByZero, "Modulo by zero");
		return intVal(expectInt(a) % bv);
	})
	.build();

// pow(number, number) -> number
const pow: Operator = defineOperator("core", "pow")
	.setParams(intType, intType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") {
			return intVal(Math.pow(a.value, b.value));
		}
		return floatVal(Math.pow(getNumeric(a), getNumeric(b)));
	})
	.build();

// neg(number) -> number
const neg: Operator = defineOperator("core", "neg")
	.setParams(intType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		if (a.kind === "int") {
			return intVal(-a.value);
		}
		if (a.kind === "float") {
			return floatVal(-a.value);
		}
		return errorVal(ErrorCodes.TypeError, "Expected numeric value");
	})
	.build();

//==============================================================================
// Comparison Operators (Polymorphic)
//==============================================================================

// eq(number, number) -> bool
const eq: Operator = defineOperator("core", "eq")
	.setParams(intType, intType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") {
			return boolVal(a.value === b.value);
		}
		if (a.kind === "float" && b.kind === "float") {
			return boolVal(a.value === b.value);
		}
		if (a.kind === "string" && b.kind === "string") {
			return boolVal(a.value === b.value);
		}
		return boolVal(getNumeric(a) === getNumeric(b));
	})
	.build();

// neq(number, number) -> bool
const neq: Operator = defineOperator("core", "neq")
	.setParams(intType, intType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") {
			return boolVal(a.value !== b.value);
		}
		if (a.kind === "float" && b.kind === "float") {
			return boolVal(a.value !== b.value);
		}
		if (a.kind === "string" && b.kind === "string") {
			return boolVal(a.value !== b.value);
		}
		return boolVal(getNumeric(a) !== getNumeric(b));
	})
	.build();

// lt(number, number) -> bool
const lt: Operator = defineOperator("core", "lt")
	.setParams(intType, intType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return boolVal(getNumeric(a) < getNumeric(b));
	})
	.build();

// lte(number, number) -> bool
const lte: Operator = defineOperator("core", "lte")
	.setParams(intType, intType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return boolVal(getNumeric(a) <= getNumeric(b));
	})
	.build();

// gt(number, number) -> bool
const gt: Operator = defineOperator("core", "gt")
	.setParams(intType, intType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return boolVal(getNumeric(a) > getNumeric(b));
	})
	.build();

// gte(number, number) -> bool
const gte: Operator = defineOperator("core", "gte")
	.setParams(intType, intType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return boolVal(getNumeric(a) >= getNumeric(b));
	})
	.build();

//==============================================================================
// Registry Creation
//==============================================================================

/**
 * Create the core domain registry with all arithmetic and comparison operators.
 * Operators are polymorphic and handle different numeric types at runtime.
 */
export function createCoreRegistry(): OperatorRegistry {
	let registry: OperatorRegistry = new Map();

	// Arithmetic operators (polymorphic: returns int for int inputs, float for float inputs)
	registry = registerOperator(registry, add);
	registry = registerOperator(registry, sub);
	registry = registerOperator(registry, mul);
	registry = registerOperator(registry, div);
	registry = registerOperator(registry, mod);
	registry = registerOperator(registry, pow);
	registry = registerOperator(registry, neg);

	// Comparison operators (polymorphic)
	registry = registerOperator(registry, eq);
	registry = registerOperator(registry, neq);
	registry = registerOperator(registry, lt);
	registry = registerOperator(registry, lte);
	registry = registerOperator(registry, gt);
	registry = registerOperator(registry, gte);

	return registry;
}

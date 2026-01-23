// SPIRAL Set Domain
// Set operators

import { ErrorCodes } from "../errors.js";
import type { Type } from "../types.js";
import {
	boolType,
	boolVal,
	errorVal,
	hashValue,
	intType,
	intVal,
	isError,
	setType,
	setVal,
} from "../types.js";
import {
	defineOperator,
	Operator,
	OperatorRegistry,
	registerOperator,
} from "./registry.js";

//==============================================================================
// Set Operators
//==============================================================================

// union(set<A>, set<A>) -> set<A>
const union: Operator = defineOperator("set", "union")
	.setParams(setType({ kind: "int" } as Type), setType({ kind: "int" } as Type))
	.setReturns(setType({ kind: "int" } as Type))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set" || b.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set values");
		}
		return setVal(new Set([...a.value, ...b.value]));
	})
	.build();

// intersect(set<A>, set<A>) -> set<A>
const intersect: Operator = defineOperator("set", "intersect")
	.setParams(setType({ kind: "int" } as Type), setType({ kind: "int" } as Type))
	.setReturns(setType({ kind: "int" } as Type))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set" || b.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set values");
		}
		const result = new Set<string>();
		for (const item of a.value) {
			if (b.value.has(item)) {
				result.add(item);
			}
		}
		return setVal(result);
	})
	.build();

// difference(set<A>, set<A>) -> set<A>
const difference: Operator = defineOperator("set", "difference")
	.setParams(setType({ kind: "int" } as Type), setType({ kind: "int" } as Type))
	.setReturns(setType({ kind: "int" } as Type))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set" || b.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set values");
		}
		const result = new Set<string>();
		for (const item of a.value) {
			if (!b.value.has(item)) {
				result.add(item);
			}
		}
		return setVal(result);
	})
	.build();

// contains(set<A>, A) -> bool
const contains: Operator = defineOperator("set", "contains")
	.setParams(setType({ kind: "int" } as Type), { kind: "int" } as Type)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set value");
		}
		return boolVal(a.value.has(hashValue(b)));
	})
	.build();

// subset(set<A>, set<A>) -> bool
const subset: Operator = defineOperator("set", "subset")
	.setParams(setType({ kind: "int" } as Type), setType({ kind: "int" } as Type))
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set" || b.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set values");
		}
		for (const item of a.value) {
			if (!b.value.has(item)) {
				return boolVal(false);
			}
		}
		return boolVal(true);
	})
	.build();

// add(set<A>, A) -> set<A>
const add: Operator = defineOperator("set", "add")
	.setParams(setType({ kind: "int" } as Type), { kind: "int" } as Type)
	.setReturns(setType({ kind: "int" } as Type))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set value");
		}
		return setVal(new Set([...a.value, hashValue(b)]));
	})
	.build();

// remove(set<A>, A) -> set<A>
const remove: Operator = defineOperator("set", "remove")
	.setParams(setType({ kind: "int" } as Type), { kind: "int" } as Type)
	.setReturns(setType({ kind: "int" } as Type))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set value");
		}
		const result = new Set(a.value);
		result.delete(hashValue(b));
		return setVal(result);
	})
	.build();

// size(set<A>) -> int
const size: Operator = defineOperator("set", "size")
	.setParams(setType({ kind: "int" } as Type))
	.setReturns(intType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		if (a.kind !== "set") {
			return errorVal(ErrorCodes.TypeError, "Expected set value");
		}
		return intVal(a.value.size);
	})
	.build();

//==============================================================================
// Registry Creation
//==============================================================================

/**
 * Create the set domain registry with all set operators.
 */
export function createSetRegistry(): OperatorRegistry {
	let registry: OperatorRegistry = new Map();

	registry = registerOperator(registry, union);
	registry = registerOperator(registry, intersect);
	registry = registerOperator(registry, difference);
	registry = registerOperator(registry, contains);
	registry = registerOperator(registry, subset);
	registry = registerOperator(registry, add);
	registry = registerOperator(registry, remove);
	registry = registerOperator(registry, size);

	return registry;
}
